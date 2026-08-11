import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companyTypeEnum } from './enums'

/** Platform, supplier, or client company. */
export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: companyTypeEnum('type').notNull(),
  name: text('name').notNull(),
  vatNumber: text('vat_number').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
