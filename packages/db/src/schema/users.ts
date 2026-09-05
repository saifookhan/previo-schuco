import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'
import { userStatusEnum } from './enums'
import { roles } from './roles'

/** Application user linked to Cognito. */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Nullable: an admin-invited user (ADR 0004) has a DB grant before
  // Cognito identity exists — syncUserFromCognito backfills this by
  // email match on first login. UNIQUE still allows multiple NULLs.
  cognitoSub: text('cognito_sub').unique(),
  email: text('email').notNull().unique(),
  name: text('name'),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'restrict' }),
  roleId: text('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'restrict' }),
  status: userStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
