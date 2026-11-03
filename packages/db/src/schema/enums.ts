import { pgEnum } from 'drizzle-orm/pg-core'

/**
 * User account status. 'pending_approval' = a company-admin requested
 * this user, but no invite email has gone out yet — a super-admin must
 * approve first (Stage 3 of the auth rework). 'invited' = approved (or
 * created directly by a super-admin, which skips approval entirely) and
 * waiting on the invite-accept email (see auth_tokens/auth-service.ts).
 * 'invite_failed' = the DB row was created but sending that email
 * failed — a distinct, queryable, retryable state, never left silently
 * as 'invited' forever (ADR 0004).
 */
export const userStatusEnum = pgEnum('user_status', [
  'pending_approval',
  'invited',
  'invite_failed',
  'active',
  'inactive',
])

/** What an auth_tokens row is for — an invite-accept link (first password) or a forgotten-password reset link. Same table, same expiry/single-use semantics either way. */
export const authTokenPurposeEnum = pgEnum('auth_token_purpose', ['invite', 'password_reset'])

/** A connection between two companies: requested by one side and waiting for the other, or accepted by both. A refused, withdrawn or removed connection is deleted, not kept with a status. */
export const companyConnectionStatusEnum = pgEnum('company_connection_status', ['pending', 'accepted'])
