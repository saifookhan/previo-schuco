import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'
import { userStatusEnum } from './enums'
import { roles } from './roles'

/** Application user, authenticated by our own JWT + password (no external identity provider — see ADR 0004's dev-login seed users, which still key off `cognitoSub` for convenience, and the auth rework that replaced Cognito). */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Nullable, legacy: previously the Cognito identity's `sub`. Still used
  // as a stable external-identity slot for the seeded dev-login demo
  // users (see demo-users.ts); a real password-auth user never has one.
  // UNIQUE still allows multiple NULLs.
  cognitoSub: text('cognito_sub').unique(),
  email: text('email').notNull().unique(),
  name: text('name'),
  // Null until the user accepts their invite (or resets a never-set
  // password) — see auth_tokens / auth-service.ts. An 'invited' user has
  // no password yet and can't log in via /api/auth/login until they do.
  passwordHash: text('password_hash'),
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
