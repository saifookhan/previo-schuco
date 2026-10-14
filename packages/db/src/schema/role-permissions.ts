import { pgTable, primaryKey, text } from 'drizzle-orm/pg-core'

import { roles } from './roles'

/**
 * Which permissions each role grants (global, editable by a super-admin).
 * While the table is empty the code defaults in `@schuco/contracts`
 * apply; the first save writes the whole matrix, after which this table
 * is the source of truth — a role with no rows has no permissions.
 */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permission] })],
)
