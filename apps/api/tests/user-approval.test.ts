process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { and, eq, inArray, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, authTokens, companies, createDb, roles, users, withSystemTransaction, type Db } from '@schuco/db'

import { getDb } from '../src/lib/db'
import {
  InviteConflictError,
  NotPendingApprovalError,
  RoleNotGrantableError,
  approveInvite,
  inviteUser,
  listPendingApprovalUsers,
  rejectInvite,
} from '../src/services/users-service'

/**
 * Service-layer test (ADR 0012) for Stage 3: a company-admin's own
 * invite must land as `pending_approval` (no email sent) until a
 * super-admin approves it; a super-admin's own invite skips approval
 * entirely.
 */

let db: Db
let companyId: string
let companyAdminUserId: string
const actor = { actorUserId: '', actorCompanyId: '', callerRoleIds: ['company-admin'], requestId: 'test-request' }
const approvalActor = { actorUserId: '', actorCompanyId: '', requestId: 'test-request' }

const companyAdminCtx = () => ({ effectiveCompanyId: companyId, isSuperAdmin: false })
const superAdminCtx = () => ({ effectiveCompanyId: companyId, isSuperAdmin: true })

beforeAll(async () => {
  db = getDb()
  await withSystemTransaction(db, async (tx) => {
    await tx
      .insert(roles)
      .values([
        { id: 'company-admin', name: 'Company Admin', description: 'test role' },
        { id: 'user', name: 'User', description: 'test role' },
        { id: 'super-user', name: 'Super User', description: 'test role' },
      ])
      .onConflictDoNothing({ target: roles.id })

    const [company] = await tx
      .insert(companies)
      .values({ isClient: true, name: 'Approval Test Co', vatNumber: 'APPROVAL-1' })
      .returning({ id: companies.id })
    companyId = company.id
    actor.actorCompanyId = companyId
    approvalActor.actorCompanyId = companyId

    const [companyAdminUser] = await tx
      .insert(users)
      .values({
        cognitoSub: 'approval-test-company-admin',
        email: 'approval-test-company-admin@example.com',
        companyId,
        roleId: 'company-admin',
        status: 'active',
      })
      .returning({ id: users.id })
    companyAdminUserId = companyAdminUser.id
    actor.actorUserId = companyAdminUserId
    approvalActor.actorUserId = companyAdminUserId
  })
})

afterAll(async () => {
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
  await superuserDb.delete(auditLog).where(inArray(auditLog.effectiveCompanyId, [companyId]))

  await withSystemTransaction(db, async (tx) => {
    await tx.delete(users).where(inArray(users.companyId, [companyId]))
    await tx.delete(companies).where(inArray(companies.id, [companyId]))
  })
})

describe('inviteUser with requiresApproval', () => {
  it('a company-admin-requested user lands as pending_approval with no invite token issued', async () => {
    const profile = await inviteUser(
      companyAdminCtx(),
      actor,
      companyId,
      { email: 'approval-pending@example.com', name: 'Pending User', roleIds: ['user'] },
      true,
    )
    expect(profile.status).toBe('pending_approval')

    const tokens = await withSystemTransaction(db, (tx) =>
      tx.select().from(authTokens).where(eq(authTokens.userId, profile.id)),
    )
    expect(tokens).toHaveLength(0)
  })

  it('re-inviting the same still-pending email is idempotent, not a conflict', async () => {
    const first = await inviteUser(
      companyAdminCtx(),
      actor,
      companyId,
      { email: 'approval-retry@example.com', name: 'Retry User', roleIds: ['user'] },
      true,
    )

    const second = await inviteUser(
      companyAdminCtx(),
      actor,
      companyId,
      { email: 'approval-retry@example.com', name: 'Retry User', roleIds: ['user'] },
      true,
    )
    expect(second.id).toBe(first.id)
    expect(second.status).toBe('pending_approval')
  })

  it('a super-admin invite skips approval entirely — invited immediately, with a token issued', async () => {
    const profile = await inviteUser(
      superAdminCtx(),
      { ...actor, callerRoleIds: ['super-admin'] },
      companyId,
      { email: 'approval-skip@example.com', name: 'Skip User', roleIds: ['user'] },
      false,
    )
    expect(profile.status).toBe('invited')

    const tokens = await withSystemTransaction(db, (tx) =>
      tx.select().from(authTokens).where(and(eq(authTokens.userId, profile.id), eq(authTokens.purpose, 'invite'))),
    )
    expect(tokens.length).toBeGreaterThan(0)
  })

  it('still rejects a genuine conflict (already-active email) regardless of requiresApproval', async () => {
    await expect(
      inviteUser(
        companyAdminCtx(),
        actor,
        companyId,
        { email: 'approval-test-company-admin@example.com', roleIds: ['user'] },
        true,
      ),
    ).rejects.toThrow(InviteConflictError)
  })
})

describe('inviteUser with several roles', () => {
  it('stores every role and makes the highest-ranked one the primary', async () => {
    const profile = await inviteUser(
      companyAdminCtx(),
      actor,
      companyId,
      { email: 'approval-multirole@example.com', roleIds: ['user', 'super-user'] },
      true,
    )
    expect(profile.role.id).toBe('super-user')
    expect(profile.roles.map((r) => r.id)).toEqual(['super-user', 'user'])
  })

  it('re-inviting a still-pending email replaces its role set', async () => {
    const email = 'approval-multirole-retry@example.com'
    await inviteUser(companyAdminCtx(), actor, companyId, { email, roleIds: ['user'] }, true)
    const again = await inviteUser(companyAdminCtx(), actor, companyId, { email, roleIds: ['user', 'super-user'] }, true)
    expect(again.roles.map((r) => r.id)).toEqual(['super-user', 'user'])
    const downgraded = await inviteUser(companyAdminCtx(), actor, companyId, { email, roleIds: ['user'] }, true)
    expect(downgraded.roles.map((r) => r.id)).toEqual(['user'])
  })

  it('rejects the whole request when any one role is not grantable by the caller', async () => {
    await expect(
      inviteUser(
        companyAdminCtx(),
        actor,
        companyId,
        { email: 'approval-multirole-denied@example.com', roleIds: ['user', 'super-admin'] },
        true,
      ),
    ).rejects.toThrow(RoleNotGrantableError)
  })

  it('rejects an empty role list', async () => {
    await expect(
      inviteUser(
        companyAdminCtx(),
        actor,
        companyId,
        { email: 'approval-multirole-empty@example.com', roleIds: [] },
        true,
      ),
    ).rejects.toThrow(RoleNotGrantableError)
  })
})

describe('approveInvite', () => {
  it('flips pending_approval -> invited and issues a real invite token', async () => {
    const pending = await inviteUser(
      companyAdminCtx(),
      actor,
      companyId,
      { email: 'approval-approve-me@example.com', name: 'Approve Me', roleIds: ['user'] },
      true,
    )

    const approved = await approveInvite(superAdminCtx(), approvalActor, pending.id)
    expect(approved.status).toBe('invited')

    const tokens = await withSystemTransaction(db, (tx) =>
      tx
        .select()
        .from(authTokens)
        .where(and(eq(authTokens.userId, pending.id), eq(authTokens.purpose, 'invite'), isNull(authTokens.usedAt))),
    )
    expect(tokens).toHaveLength(1)
    expect(tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('rejects approving a user who is not pending_approval (already approved, or never existed)', async () => {
    const pending = await inviteUser(
      companyAdminCtx(),
      actor,
      companyId,
      { email: 'approval-double-approve@example.com', roleIds: ['user'] },
      true,
    )
    await approveInvite(superAdminCtx(), approvalActor, pending.id)

    await expect(approveInvite(superAdminCtx(), approvalActor, pending.id)).rejects.toThrow(NotPendingApprovalError)
    await expect(
      approveInvite(superAdminCtx(), approvalActor, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(NotPendingApprovalError)
  })
})

describe('rejectInvite', () => {
  it('deletes the pending row outright — the user no longer exists at all', async () => {
    const pending = await inviteUser(
      companyAdminCtx(),
      actor,
      companyId,
      { email: 'approval-reject-me@example.com', roleIds: ['user'] },
      true,
    )

    await rejectInvite(superAdminCtx(), approvalActor, pending.id)

    const rows = await withSystemTransaction(db, (tx) => tx.select().from(users).where(eq(users.id, pending.id)))
    expect(rows).toHaveLength(0)

    await expect(rejectInvite(superAdminCtx(), approvalActor, pending.id)).rejects.toThrow(NotPendingApprovalError)
  })
})

describe('listPendingApprovalUsers', () => {
  it('is unscoped and only returns pending_approval users, not invited/active ones', async () => {
    const pending = await inviteUser(
      companyAdminCtx(),
      actor,
      companyId,
      { email: 'approval-listed@example.com', roleIds: ['user'] },
      true,
    )

    const rows = await listPendingApprovalUsers(superAdminCtx())
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(pending.id)
    expect(ids).not.toContain(companyAdminUserId) // active, not pending
    expect(rows.every((r) => r.status === 'pending_approval')).toBe(true)
  })
})
