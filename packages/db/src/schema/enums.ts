import { pgEnum } from 'drizzle-orm/pg-core'

/** Company type in the PREVIO platform. */
export const companyTypeEnum = pgEnum('company_type', [
  'platform',
  'supplier',
  'client',
])

/**
 * User account status. 'invited' = admin-created, not yet linked to a
 * Cognito login. 'invite_failed' = the DB row was created but the
 * Cognito AdminCreateUser call failed — a distinct, queryable,
 * retryable state, never left silently as 'invited' forever (ADR 0004).
 */
export const userStatusEnum = pgEnum('user_status', [
  'invited',
  'invite_failed',
  'active',
  'inactive',
])
