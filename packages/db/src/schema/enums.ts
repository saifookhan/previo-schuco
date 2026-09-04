import { pgEnum } from 'drizzle-orm/pg-core'

/** Company type in the PREVIO platform. */
export const companyTypeEnum = pgEnum('company_type', [
  'platform',
  'supplier',
  'client',
])

/** User account status. 'invited' = admin-created, not yet linked to a Cognito login (see ADR 0004). */
export const userStatusEnum = pgEnum('user_status', ['invited', 'active', 'inactive'])
