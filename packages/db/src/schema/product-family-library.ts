import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'
import { productFamilies } from './product-families'
import { users } from './users'

/**
 * Families a company has taken out of its library ("In libreria: No"): the
 * company's quote builder no longer offers them, and only its admins and
 * managers still see them in the catalog. Every family a company can see is in
 * its library unless a row here says otherwise, so a newly shared family — and a
 * new version, which is a new family — starts in it. A row outlives an unshare:
 * shared again, the family comes back still out of the library. Per company, not
 * on the family: the owner and each company it is shared with decide for themselves.
 */
export const productFamilyLibraryHidden = pgTable(
  'product_family_library_hidden',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productFamilyId: uuid('product_family_id')
      .notNull()
      .references(() => productFamilies.id, { onDelete: 'cascade' }),
    hiddenByUserId: uuid('hidden_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // (company, family) is also the lookup for "is this family in my library".
  (table) => [
    primaryKey({ columns: [table.companyId, table.productFamilyId] }),
    // Deleting a family cascades here.
    index('product_family_library_hidden_family_idx').on(table.productFamilyId),
  ],
)
