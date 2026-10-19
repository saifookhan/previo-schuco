import {
  getUserByEmail,
  getUserProfileById,
  getValidAuthTokenByHash,
  hasRecentAuditEntry,
  insertAuthToken,
  invalidatePendingAuthTokens,
  markAuthTokenUsed,
  setUserPassword,
  withSystemTransaction,
  type DbLike,
  type UserProfile,
} from '@schuco/db'

import { getDb } from '../lib/db'
import { AUTH_TOKEN_TTL_MS, generateRawToken, hashToken } from '../lib/auth-tokens'
import { hashPassword, isPasswordStrongEnough, verifyPassword } from '../lib/password'
import { sendInviteEmail, sendPasswordResetEmail } from '../lib/email'
import { logger } from '../lib/logger'
import { recordAuditEvent } from './audit-service'

/** Email/password didn't match a real, loggable-in account. Deliberately the same message for "no such email" and "wrong password" — never confirm which one it was. */
export class InvalidCredentialsError extends Error {}

/** The account exists and the password matched, but it's not `active` (still `invited`, or an admin deactivated it — or the account's company was deactivated). */
export class AccountNotActiveError extends Error {}

/** The invite/reset token is missing, already used, or expired. */
export class InvalidTokenError extends Error {}

export class WeakPasswordError extends Error {}

const appPublicUrl = (): string => process.env.APP_PUBLIC_URL ?? 'http://localhost:3000'

/** Request metadata the auth audit entries carry (these routes run before `requireAuth`, so it's passed in). */
export interface AuthRequestContext {
  requestId?: string | null
}

type LoginFailureReason = 'wrong_password' | 'no_password_set' | 'account_not_active' | 'company_inactive'

/** At most one `auth.login_failed` entry per account in this window — a password-guessing script must not flood the append-only table. Every attempt is still logged. */
const LOGIN_FAILURE_AUDIT_WINDOW_MS = 60_000

/**
 * A login is not a business mutation, so its audit entry is its own short
 * transaction — and best-effort: a failing audit insert is logged, never turned
 * into a 500 that hides the real login outcome.
 */
const auditLoginBestEffort = async (write: (tx: DbLike) => Promise<void>, context: AuthRequestContext): Promise<void> => {
  try {
    await withSystemTransaction(getDb(), write)
  } catch (error) {
    logger.error({ err: error, requestId: context.requestId }, 'could not write login audit entry')
  }
}

/**
 * Audits a failed login against a real account, at most once per account per
 * minute. Unknown emails are only logged (there is no company to file the entry
 * under, and storing the email would turn the audit log into a list of guessed emails).
 */
const auditLoginFailure = async (
  account: { id: string; companyId: string },
  reason: LoginFailureReason,
  context: AuthRequestContext,
): Promise<void> => {
  logger.warn({ requestId: context.requestId, userId: account.id, reason }, 'login failed')
  await auditLoginBestEffort(async (tx) => {
    if (await hasRecentAuditEntry(tx, 'user', account.id, 'auth.login_failed', new Date(Date.now() - LOGIN_FAILURE_AUDIT_WINDOW_MS))) {
      return
    }
    await recordAuditEvent(tx, { actorType: 'user', actorUserId: null, actorCompanyId: null, requestId: context.requestId }, account.companyId, {
      action: 'auth.login_failed',
      resourceType: 'user',
      resourceId: account.id,
      metadata: { reason },
    })
  }, context)
}

/**
 * Verifies email+password and returns the full profile on success. Never
 * reveals whether the email exists at all — a nonexistent account and a
 * wrong password both throw the same `InvalidCredentialsError`.
 * @throws {InvalidCredentialsError} no such account, or the password didn't match
 * @throws {AccountNotActiveError} the account (or its company) isn't active
 */
export const login = async (email: string, password: string, context: AuthRequestContext = {}): Promise<UserProfile> => {
  const db = getDb()
  const row = await withSystemTransaction(db, (tx) => getUserByEmail(tx, email))

  if (!row) {
    logger.warn({ requestId: context.requestId, reason: 'unknown_email' }, 'login failed')
    throw new InvalidCredentialsError('Invalid email or password')
  }
  if (!row.passwordHash || !(await verifyPassword(password, row.passwordHash))) {
    await auditLoginFailure(row, row.passwordHash ? 'wrong_password' : 'no_password_set', context)
    throw new InvalidCredentialsError('Invalid email or password')
  }
  if (row.status !== 'active') {
    await auditLoginFailure(row, 'account_not_active', context)
    throw new AccountNotActiveError(`Account status is '${row.status}'`)
  }

  const profile = await withSystemTransaction(db, (tx) => getUserProfileById(tx, row.id))
  if (!profile) {
    throw new InvalidCredentialsError('Invalid email or password')
  }
  if (!profile.company.isActive) {
    await auditLoginFailure(row, 'company_inactive', context)
    throw new AccountNotActiveError('Company account deactivated')
  }

  await auditLoginBestEffort(
    (tx) =>
      recordAuditEvent(
        tx,
        { actorType: 'user', actorUserId: profile.id, actorCompanyId: profile.company.id, requestId: context.requestId },
        profile.company.id,
        { action: 'auth.login', resourceType: 'user', resourceId: profile.id },
      ),
    context,
  )
  return profile
}

/**
 * Issues a fresh invite-accept token for `userId` and emails it. Any
 * still-pending invite token for this user is invalidated first — only
 * the newest link works. Called right after `createInvitedUser` (see
 * users-service.ts), replacing the old Cognito AdminCreateUser call.
 */
export const issueInviteToken = async (userId: string, email: string, name: string | null): Promise<void> => {
  const db = getDb()
  const rawToken = generateRawToken()

  await withSystemTransaction(db, async (tx) => {
    await invalidatePendingAuthTokens(tx, userId, 'invite')
    await insertAuthToken(tx, {
      userId,
      tokenHash: hashToken(rawToken),
      purpose: 'invite',
      expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL_MS.invite),
    })
  })

  await sendInviteEmail({
    to: email,
    name,
    setPasswordUrl: `${appPublicUrl()}/set-password?token=${rawToken}`,
  })
}

/**
 * Consumes an invite or password-reset token and sets the new password.
 * The same function serves both purposes — the token row itself already
 * says which one it is, so the caller (a single "set password" form)
 * doesn't need to know or care.
 * @throws {InvalidTokenError} missing/used/expired token
 * @throws {WeakPasswordError} `newPassword` too short
 */
export const consumeAuthToken = async (
  rawToken: string,
  newPassword: string,
  context: AuthRequestContext = {},
): Promise<UserProfile> => {
  if (!isPasswordStrongEnough(newPassword)) {
    throw new WeakPasswordError('Password must be at least 10 characters')
  }

  const db = getDb()
  const tokenHash = hashToken(rawToken)
  const token = await withSystemTransaction(db, (tx) => getValidAuthTokenByHash(tx, tokenHash))
  if (!token) {
    throw new InvalidTokenError('This link is invalid or has expired')
  }

  const passwordHash = await hashPassword(newPassword)
  const profile = await withSystemTransaction(db, async (tx) => {
    await setUserPassword(tx, token.userId, passwordHash)
    await markAuthTokenUsed(tx, token.id)
    const updated = await getUserProfileById(tx, token.userId)
    if (updated) {
      await recordAuditEvent(
        tx,
        { actorType: 'user', actorUserId: updated.id, actorCompanyId: updated.company.id, requestId: context.requestId },
        updated.company.id,
        { action: 'auth.password_set', resourceType: 'user', resourceId: updated.id, metadata: { purpose: token.purpose } },
      )
    }
    return updated
  })

  if (!profile) {
    throw new InvalidTokenError('This link is invalid or has expired')
  }
  return profile
}

/**
 * Requests a password-reset email. Always resolves without error and
 * without revealing whether the email exists — the caller's route
 * should return the same generic "check your email" response either
 * way (never let this become an email-enumeration oracle).
 */
export const requestPasswordReset = async (email: string, context: AuthRequestContext = {}): Promise<void> => {
  const db = getDb()
  const row = await withSystemTransaction(db, (tx) => getUserByEmail(tx, email))
  if (!row || row.status === 'inactive') {
    return
  }

  const rawToken = generateRawToken()
  await withSystemTransaction(db, async (tx) => {
    await invalidatePendingAuthTokens(tx, row.id, 'password_reset')
    await insertAuthToken(tx, {
      userId: row.id,
      tokenHash: hashToken(rawToken),
      purpose: 'password_reset',
      expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL_MS.password_reset),
    })
    await recordAuditEvent(tx, { actorType: 'user', actorUserId: null, actorCompanyId: null, requestId: context.requestId }, row.companyId, {
      action: 'auth.password_reset_requested',
      resourceType: 'user',
      resourceId: row.id,
    })
  })

  await sendPasswordResetEmail({
    to: row.email,
    resetUrl: `${appPublicUrl()}/set-password?token=${rawToken}`,
  })
}
