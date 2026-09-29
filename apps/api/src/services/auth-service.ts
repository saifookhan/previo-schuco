import {
  getUserByEmail,
  getUserProfileById,
  getValidAuthTokenByHash,
  insertAuthToken,
  invalidatePendingAuthTokens,
  markAuthTokenUsed,
  setUserPassword,
  withSystemTransaction,
  type UserProfile,
} from '@schuco/db'

import { getDb } from '../lib/db'
import { AUTH_TOKEN_TTL_MS, generateRawToken, hashToken } from '../lib/auth-tokens'
import { hashPassword, isPasswordStrongEnough, verifyPassword } from '../lib/password'
import { sendInviteEmail, sendPasswordResetEmail } from '../lib/email'

/** Email/password didn't match a real, loggable-in account. Deliberately the same message for "no such email" and "wrong password" — never confirm which one it was. */
export class InvalidCredentialsError extends Error {}

/** The account exists and the password matched, but it's not `active` (still `invited`, or an admin deactivated it — or the account's company was deactivated). */
export class AccountNotActiveError extends Error {}

/** The invite/reset token is missing, already used, or expired. */
export class InvalidTokenError extends Error {}

export class WeakPasswordError extends Error {}

const appPublicUrl = (): string => process.env.APP_PUBLIC_URL ?? 'http://localhost:3000'

/**
 * Verifies email+password and returns the full profile on success. Never
 * reveals whether the email exists at all — a nonexistent account and a
 * wrong password both throw the same `InvalidCredentialsError`.
 * @throws {InvalidCredentialsError} no such account, or the password didn't match
 * @throws {AccountNotActiveError} the account (or its company) isn't active
 */
export const login = async (email: string, password: string): Promise<UserProfile> => {
  const db = getDb()
  const row = await withSystemTransaction(db, (tx) => getUserByEmail(tx, email))

  if (!row || !row.passwordHash || !(await verifyPassword(password, row.passwordHash))) {
    throw new InvalidCredentialsError('Invalid email or password')
  }
  if (row.status !== 'active') {
    throw new AccountNotActiveError(`Account status is '${row.status}'`)
  }

  const profile = await withSystemTransaction(db, (tx) => getUserProfileById(tx, row.id))
  if (!profile) {
    throw new InvalidCredentialsError('Invalid email or password')
  }
  if (!profile.company.isActive) {
    throw new AccountNotActiveError('Company account deactivated')
  }
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
export const consumeAuthToken = async (rawToken: string, newPassword: string): Promise<UserProfile> => {
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
  await withSystemTransaction(db, async (tx) => {
    await setUserPassword(tx, token.userId, passwordHash)
    await markAuthTokenUsed(tx, token.id)
  })

  const profile = await withSystemTransaction(db, (tx) => getUserProfileById(tx, token.userId))
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
export const requestPasswordReset = async (email: string): Promise<void> => {
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
  })

  await sendPasswordResetEmail({
    to: row.email,
    resetUrl: `${appPublicUrl()}/set-password?token=${rawToken}`,
  })
}
