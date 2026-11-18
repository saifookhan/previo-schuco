import { sql } from 'drizzle-orm'
import { check, index, numeric, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'
import { characteristics, productFamilies, productLines } from './product-families'

/**
 * One company sharing one product family with another. Sharing chains: the owner shares with B, and B (who can now
 * see it) may share onward to C with B's own discount. Whether a company
 * can see a family is decided by reachability from the owner across these
 * rows (`app_family_reaches_company` in 0001_rls.sql), so revoking an
 * upstream share automatically cuts off everything downstream of it.
 * The discount, markup and installation hours the recipient gets are per
 * product line and option, in `productFamilyShareItems`.
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Also serves the recursive reachability walk, which looks up (family, from_company).
    uniqueIndex('product_family_shares_family_from_to_idx').on(table.productFamilyId, table.fromCompanyId, table.toCompanyId),
    // "What has been shared with me" — the per-recipient lookup behind the family list.
    index('product_family_shares_to_company_idx').on(table.toCompanyId),
    check('product_family_shares_no_self_share', sql`${table.fromCompanyId} <> ${table.toCompanyId}`),
  ],
)

/**
 * What one share gives the recipient for one product line or one option (a
 * sub-characteristic): the discount, markup ("out of 100", 100 = none) and
 * installation hours per unit its quote positions start with — editable per
 * position, not enforced. Exactly one of productLineId/characteristicId is set.
 * A line or option without a row falls back to the family's own values (the Excel's).
 */
export const productFamilyShareItems = pgTable(
  'product_family_share_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shareId: uuid('share_id')
      .notNull()
      .references(() => productFamilyShares.id, { onDelete: 'cascade' }),
    productLineId: uuid('product_line_id').references(() => productLines.id, { onDelete: 'cascade' }),
    characteristicId: uuid('characteristic_id').references(() => characteristics.id, { onDelete: 'cascade' }),
    discountPct: numeric('discount_pct', { precision: 8, scale: 4 }).notNull().default('0'),
    markupPct: numeric('markup_pct', { precision: 8, scale: 4 }).notNull().default('100'),
    installationHoursPerUnit: numeric('installation_hours_per_unit', { precision: 14, scale: 4 }).notNull().default('0'),
  },
  (table) => [
    // Also serves loading a share's items by share_id.
    uniqueIndex('product_family_share_items_share_line_idx').on(table.shareId, table.productLineId),
    uniqueIndex('product_family_share_items_share_characteristic_idx').on(table.shareId, table.characteristicId),
    // The cascades from a deleted line or option.
    index('product_family_share_items_product_line_id_idx').on(table.productLineId),
    index('product_family_share_items_characteristic_id_idx').on(table.characteristicId),
    check('product_family_share_items_one_item', sql`(${table.productLineId} IS NULL) <> (${table.characteristicId} IS NULL)`),
    check('product_family_share_items_discount_range', sql`${table.discountPct} >= 0 AND ${table.discountPct} <= 100`),
    check('product_family_share_items_markup_range', sql`${table.markupPct} >= 0 AND ${table.markupPct} <= 10000`),
    check('product_family_share_items_hours_range', sql`${table.installationHoursPerUnit} >= 0`),
  ],
)
