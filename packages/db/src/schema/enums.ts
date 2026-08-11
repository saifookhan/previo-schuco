import { pgEnum } from 'drizzle-orm/pg-core'

/** Company type in the PREVIO platform. */
export const companyTypeEnum = pgEnum('company_type', [
  'platform',
  'supplier',
  'client',
])

/** User account status. */
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive'])
