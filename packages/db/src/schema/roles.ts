import { pgTable, text } from 'drizzle-orm/pg-core'

/** Canonical RBAC roles (4 fixed rows). */
export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
})
