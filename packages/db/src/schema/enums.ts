import { pgEnum } from 'drizzle-orm/pg-core'

/** Company type in the PREVIO platform. */
export const companyTypeEnum = pgEnum('company_type', [
  'platform',
  'supplier',
  'client',
])

/**
 * User account status. 'invited' = admin-created, no password set yet —
 * waiting on the invite-accept email (see auth_tokens/auth-service.ts).
 * 'invite_failed' = the DB row was created but sending that email
 * failed — a distinct, queryable, retryable state, never left silently
 * as 'invited' forever (ADR 0004).
 */
export const userStatusEnum = pgEnum('user_status', [
  'invited',
  'invite_failed',
  'active',
  'inactive',
])

/** What an auth_tokens row is for — an invite-accept link (first password) or a forgotten-password reset link. Same table, same expiry/single-use semantics either way. */
export const authTokenPurposeEnum = pgEnum('auth_token_purpose', ['invite', 'password_reset'])
