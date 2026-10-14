import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'

import { roles } from './roles'
import { users } from './users'

/**
 * Roles a user holds IN ADDITION to `users.role_id` (their primary role —
 * always the highest-ranked role they hold, kept in sync by `setUserRoles`).
 * A user's effective roles are the primary plus every row here.
 */
export const userAdditionalRoles = pgTable(
  'user_additional_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
)
