import { pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'

/** Many-to-many supplier ↔ client relationship. */
export const supplierClientLinks = pgTable(
  'supplier_client_links',
  {
    supplierCompanyId: uuid('supplier_company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    clientCompanyId: uuid('client_company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.supplierCompanyId, table.clientCompanyId] })],
)
