import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companyTypeEnum } from './enums'

/** Platform, supplier, or client company. */
export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: companyTypeEnum('type').notNull(),
  name: text('name').notNull(),
  vatNumber: text('vat_number').notNull(),
  /** Deactivated instead of deleted — a company has users/catalog/quotes cascading off it, so admin-panel "delete" is a reversible toggle, not a DELETE statement. */
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
