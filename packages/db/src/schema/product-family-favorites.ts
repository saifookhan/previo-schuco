import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'
import { productFamilies } from './product-families'

/**
 * Versions a company has marked as a favorite. Each product-family version is its own row,
 * so favoriting V2 does not favorite V1. Per company, not on the family: the owner and each
 * company a family is shared with decide for themselves, and a new version starts unfavorited.
 */
export const productFamilyFavorites = pgTable(
  'product_family_favorites',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productFamilyId: uuid('product_family_id')
      .notNull()
      .references(() => productFamilies.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.productFamilyId] }),
    index('product_family_favorites_family_idx').on(table.productFamilyId),
  ],
)
