import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'

/** Branch or business unit under a company (unità locale): its logo, name and contacts head the pages of its quotes. */
export const businessUnits = pgTable(
  'business_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: text('address'),
    /** The logo as a data URL (small PNG/JPEG/WebP/SVG), so the printed quote embeds it without a file server. */
    logoUrl: text('logo_url'),
    email: text('email'),
    phone: text('phone'),
    /** Accent of the printed quote's header (name and rule). */
    primaryColor: text('primary_color').notNull().default('#1E5F8C'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // The company profile lists a company's branches.
    index('business_units_company_id_idx').on(table.companyId),
  ],
)
