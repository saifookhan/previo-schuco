import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'

/** Branch or business unit under a company. */
export const businessUnits = pgTable('business_units', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address'),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
