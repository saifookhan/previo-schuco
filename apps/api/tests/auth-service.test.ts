process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`
// No RESEND_API_KEY here on purpose — exercises the dev-bypass path (no real network call), same philosophy as the old Cognito dev-bypass.

import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  auditLog,
  companies,
  createDb,
  createInvitedUser,
  insertAuthToken,
  roles,
  users,
  withSystemTransaction,
  type Db,
} from '@schuco/db'

import { getDb } from '../src/lib/db'
import { AUTH_TOKEN_TTL_MS, generateRawToken, hashToken } from '../src/lib/auth-tokens'
import { hashPassword } from '../src/lib/password'
import { auth as authRoutes } from '../src/routes/auth'
import {
  AccountNotActiveError,
  InvalidCredentialsError,
  InvalidTokenError,
  WeakPasswordError,
  consumeAuthToken,
  login,
  requestPasswordReset,
} from '../src/services/auth-service'

/** Mints a token the same way auth-service.ts does internally, but hands back the raw value too — issueInviteToken/requestPasswordReset only ever email it, so tests that need to actually consume one mint it directly instead of scraping console output. */
const mintTestToken = async (userId: string, purpose: 'invite' | 'password_reset'): Promise<string> => {
  const rawToken = generateRawToken()
  await withSystemTransaction(getDb(), (tx) =>
    insertAuthToken(tx, {
      userId,
      tokenHash: hashToken(rawToken),
      purpose,
      expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL_MS[purpose]),
    }),
  )
  return rawToken
}

/**
 * Service-layer test (ADR 0012) for the password-auth rework that
 * replaced Cognito: login, invite-accept, and password-reset, each
 * exercised against a real Postgres, not mocked.
 */

let db: Db
let companyId: string
let activeUserId: string
const ACTIVE_PASSWORD = 'correct-horse-battery'
const createdUserIds: string[] = []

beforeAll(async () => {
  db = getDb()
  await withSystemTransaction(db, async (tx) => {
    await tx
      .insert(roles)
      .values({ id: 'company-admin', name: 'Company Admin', description: 'test role' })
      .onConflictDoNothing({ target: roles.id })

    const [company] = await tx
      .insert(companies)
      .values({ isClient: true, name: 'Auth Service Test Co', vatNumber: 'AUTHSVC-1' })
      .returning({ id: companies.id })
    companyId = company.id

    const passwordHash = await hashPassword(ACTIVE_PASSWORD)
    const [user] = await tx
      .insert(users)
      .values({
        email: 'authsvc-active@example.com',
        companyId,
        roleId: 'company-admin',
        status: 'active',
        passwordHash,
      })
      .returning({ id: users.id })
    activeUserId = user.id
    createdUserIds.push(activeUserId)
  })
})

afterAll(async () => {
  // The auth flows now write audit entries; audit_log is append-only for the app role (ADR 0010),
  // so its cleanup needs the superuser connection.
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
  await superuserDb.delete(auditLog).where(eq(auditLog.effectiveCompanyId, companyId))
  await superuserDb.$client.end()

  await withSystemTransaction(db, async (tx) => {
    await tx.delete(users).where(inArray(users.companyId, [companyId]))
    await tx.delete(companies).where(inArray(companies.id, [companyId]))
  })
})

describe('login', () => {
  it('succeeds with the right email+password for an active account', async () => {
    const profile = await login('authsvc-active@example.com', ACTIVE_PASSWORD)
    expect(profile.id).toBe(activeUserId)
    expect(profile.status).toBe('active')
  })

  it('rejects a wrong password with the same error as a nonexistent email (no enumeration)', async () => {
    await expect(login('authsvc-active@example.com', 'wrong-password')).rejects.toThrow(InvalidCredentialsError)
    await expect(login('nobody-here@example.com', ACTIVE_PASSWORD)).rejects.toThrow(InvalidCredentialsError)
  })

  it('rejects an invited user who has no password set yet', async () => {
    const invited = await withSystemTransaction(db, (tx) =>
      createInvitedUser(tx, { email: 'authsvc-invited@example.com', companyId, roleIds: ['company-admin'] }),
    )
    createdUserIds.push(invited.id)
    await expect(login('authsvc-invited@example.com', 'anything')).rejects.toThrow(InvalidCredentialsError)
  })

  it('rejects an explicitly inactive account even with the correct password', async () => {
    const passwordHash = await hashPassword('some-password-123')
    const [inactiveUser] = await withSystemTransaction(db, (tx) =>
      tx
        .insert(users)
        .values({ email: 'authsvc-inactive@example.com', companyId, roleId: 'company-admin', status: 'inactive', passwordHash })
        .returning({ id: users.id }),
    )
    createdUserIds.push(inactiveUser.id)
    await expect(login('authsvc-inactive@example.com', 'some-password-123')).rejects.toThrow(AccountNotActiveError)
  })
})

describe('consumeAuthToken (invite-accept / password-reset)', () => {
  it('lets a fresh invite token set a password, activates the account, and cannot be reused', async () => {
    const invited = await withSystemTransaction(db, (tx) =>
      createInvitedUser(tx, { email: 'authsvc-accept@example.com', companyId, roleIds: ['company-admin'] }),
    )
    createdUserIds.push(invited.id)
    expect(invited.status).toBe('invited')

    const rawToken = await mintTestToken(invited.id, 'invite')
    const activated = await consumeAuthToken(rawToken, 'brand-new-password-123')
    expect(activated.id).toBe(invited.id)
    expect(activated.status).toBe('active')

    // The now-set password actually works...
    const loggedIn = await login('authsvc-accept@example.com', 'brand-new-password-123')
    expect(loggedIn.id).toBe(invited.id)

    // ...and the same token can't be replayed to set it again.
    await expect(consumeAuthToken(rawToken, 'another-password-123')).rejects.toThrow(InvalidTokenError)
  })

  it('a password-reset token works the same way for an already-active user, without disturbing their status', async () => {
    const rawToken = await mintTestToken(activeUserId, 'password_reset')
    const updated = await consumeAuthToken(rawToken, 'freshly-reset-password-1')
    expect(updated.status).toBe('active')

    const loggedIn = await login('authsvc-active@example.com', 'freshly-reset-password-1')
    expect(loggedIn.id).toBe(activeUserId)
  })

  it('rejects an expired token', async () => {
    const invited = await withSystemTransaction(db, (tx) =>
      createInvitedUser(tx, { email: 'authsvc-expired@example.com', companyId, roleIds: ['company-admin'] }),
    )
    createdUserIds.push(invited.id)

    const rawToken = generateRawToken()
    await withSystemTransaction(db, (tx) =>
      insertAuthToken(tx, {
        userId: invited.id,
        tokenHash: hashToken(rawToken),
        purpose: 'invite',
        expiresAt: new Date(Date.now() - 1000), // already expired
      }),
    )
    await expect(consumeAuthToken(rawToken, 'brand-new-password-123')).rejects.toThrow(InvalidTokenError)
  })

  it('rejects an unknown/garbage token', async () => {
    await expect(consumeAuthToken('not-a-real-token', 'brand-new-password-123')).rejects.toThrow(InvalidTokenError)
  })

  it('rejects a password shorter than the minimum', async () => {
    await expect(consumeAuthToken('not-a-real-token', 'short')).rejects.toThrow(WeakPasswordError)
  })
})

describe('POST /api/auth/login and /api/auth/set-password (HTTP layer)', () => {
  // Exercises the actual Hono routes, not just the service functions — the
  // service layer alone can't catch a response-shape bug: an earlier
  // version of this route mapped the service's UserProfile through the
  // narrower tenant-scoped UserDto before validating it against the full
  // userProfileSchema (which requires company/role.description/etc that
  // DTO doesn't have), so every real login 500'd with "Internal response
  // validation failed" despite every service-level test above passing.
  it('POST /login returns a full user profile (company, role.description — not the narrower UserDto shape)', async () => {
    const response = await authRoutes.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'authsvc-active@example.com', password: 'freshly-reset-password-1' }),
    })
    expect(response.status).toBe(200)
    const data = (await response.json()) as { user: { id: string; company: { id: string }; role: { description: string } } }
    expect(data.user.id).toBe(activeUserId)
    expect(data.user.company.id).toBe(companyId)
    expect(data.user.role.description).toBeTruthy()
  })

  it('POST /set-password returns a full user profile too', async () => {
    const invited = await withSystemTransaction(db, (tx) =>
      createInvitedUser(tx, { email: 'authsvc-http-accept@example.com', companyId, roleIds: ['company-admin'] }),
    )
    createdUserIds.push(invited.id)
    const rawToken = await mintTestToken(invited.id, 'invite')

    const response = await authRoutes.request('/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken, password: 'brand-new-password-123' }),
    })
    expect(response.status).toBe(200)
    const data = (await response.json()) as { user: { id: string; status: string; company: { id: string } } }
    expect(data.user.id).toBe(invited.id)
    expect(data.user.status).toBe('active')
    expect(data.user.company.id).toBe(companyId)
  })
})

describe('requestPasswordReset', () => {
  it('never throws for an unknown email (no enumeration)', async () => {
    await expect(requestPasswordReset('nobody-at-all@example.com')).resolves.toBeUndefined()
  })

  it('resolves for a real active account too', async () => {
    await expect(requestPasswordReset('authsvc-active@example.com')).resolves.toBeUndefined()
  })
})

describe('auth audit trail', () => {
  const auditFor = (userId: string, action: string) =>
    withSystemTransaction(db, (tx) =>
      tx
        .select({ requestId: auditLog.requestId, actorUserId: auditLog.actorUserId, metadata: auditLog.metadata })
        .from(auditLog)
        .where(and(eq(auditLog.resourceId, userId), eq(auditLog.action, action))),
    )

  // Runs first: an earlier test changed this user's password; this puts ACTIVE_PASSWORD back.
  it('records a password set from a token, with the token purpose', async () => {
    const rawToken = await mintTestToken(activeUserId, 'password_reset')
    await consumeAuthToken(rawToken, ACTIVE_PASSWORD, { requestId: 'req-set-pw' })
    const rows = await auditFor(activeUserId, 'auth.password_set')
    expect(rows.find((row) => row.requestId === 'req-set-pw')?.metadata).toEqual({ purpose: 'password_reset' })
  })

  it('records a successful login with its request id, filed under the user\'s company', async () => {
    await login('authsvc-active@example.com', ACTIVE_PASSWORD, { requestId: 'req-login-ok' })
    const rows = await auditFor(activeUserId, 'auth.login')
    expect(rows.find((row) => row.requestId === 'req-login-ok')?.actorUserId).toBe(activeUserId)
  })

  it('records a wrong password as auth.login_failed without an actor — once per minute per account', async () => {
    const passwordHash = await hashPassword('guess-me-not-123')
    const [target] = await withSystemTransaction(db, (tx) =>
      tx
        .insert(users)
        .values({ email: 'authsvc-bruteforce@example.com', companyId, roleId: 'company-admin', status: 'active', passwordHash })
        .returning({ id: users.id }),
    )
    createdUserIds.push(target.id)

    for (const requestId of ['req-login-bad-1', 'req-login-bad-2', 'req-login-bad-3']) {
      await expect(login('authsvc-bruteforce@example.com', 'wrong-password', { requestId })).rejects.toThrow(InvalidCredentialsError)
    }
    const rows = await auditFor(target.id, 'auth.login_failed')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ requestId: 'req-login-bad-1', actorUserId: null, metadata: { reason: 'wrong_password' } })
  })

  it('writes nothing for an unknown email (no company to file it under, and no guessed emails stored)', async () => {
    await expect(login('nobody-at-all@example.com', 'whatever', { requestId: 'req-unknown' })).rejects.toThrow(
      InvalidCredentialsError,
    )
    const rows = await withSystemTransaction(db, (tx) =>
      tx.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.requestId, 'req-unknown')),
    )
    expect(rows).toHaveLength(0)
  })

  it('records a password reset request for a real account', async () => {
    await requestPasswordReset('authsvc-active@example.com', { requestId: 'req-reset' })
    const rows = await auditFor(activeUserId, 'auth.password_reset_requested')
    expect(rows.some((row) => row.requestId === 'req-reset')).toBe(true)
  })
})
