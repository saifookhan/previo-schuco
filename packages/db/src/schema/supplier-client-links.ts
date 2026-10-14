import { sql } from 'drizzle-orm'
import { check, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'

/** Many-to-many link: a manufacturer (supplier_company_id) shares its published catalog with a supplier or client (client_company_id). Column names predate the manufacturer/supplier split. */
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
  (table) => [
    primaryKey({ columns: [table.supplierCompanyId, table.clientCompanyId] }),
    check('supplier_client_links_no_self_link', sql`${table.supplierCompanyId} <> ${table.clientCompanyId}`),
  ],
)
