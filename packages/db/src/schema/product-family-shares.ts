import { sql } from 'drizzle-orm'
import { check, index, numeric, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'
import { productFamilies } from './product-families'

/**
 * One company sharing one product family with another, with a default
 * discount. Sharing chains: the owner shares with B, and B (who can now
 * see it) may share onward to C with B's own discount. Whether a company
 * can see a family is decided by reachability from the owner across these
 * rows (`app_family_reaches_company` in 0001_rls.sql), so revoking an
 * upstream share automatically cuts off everything downstream of it.
 * `discountPct` is the default discount the recipient's quote positions
 * from this family start with — editable per position, not enforced.
 */
export const productFamilyShares = pgTable(
  'product_family_shares',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productFamilyId: uuid('product_family_id')
      .notNull()
      .references(() => productFamilies.id, { onDelete: 'cascade' }),
    fromCompanyId: uuid('from_company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    toCompanyId: uuid('to_company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Also serves the recursive reachability walk, which looks up (family, from_company).
    uniqueIndex('product_family_shares_family_from_to_idx').on(table.productFamilyId, table.fromCompanyId, table.toCompanyId),
    // "What has been shared with me" — the per-recipient lookup behind the family list.
    index('product_family_shares_to_company_idx').on(table.toCompanyId),
    check('product_family_shares_no_self_share', sql`${table.fromCompanyId} <> ${table.toCompanyId}`),
    check('product_family_shares_discount_range', sql`${table.discountPct} >= 0 AND ${table.discountPct} <= 100`),
  ],
)
