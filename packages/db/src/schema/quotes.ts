import { index, integer, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'
import { characteristics, productFamilies, productLines } from './product-families'
import { users } from './users'

export const quoteStatusEnum = pgEnum('quote_status', ['draft', 'sent', 'accepted', 'rejected'])

/**
 * 'auto' = computed from the catalog's formula/matrix (the normal path);
 * 'manual' = the sales user typed a €/unit value directly, bypassing the
 * formula entirely — the reference app's per-row "A"/"M" toggle. Applies
 * independently to a position's own line price and to each selected
 * characteristic's price (see quotePositions.pricingMode /
 * quotePositionCharacteristics.pricingMode below).
 */
export const pricingModeEnum = pgEnum('pricing_mode', ['auto', 'manual'])

/**
 * A supplier's quote (preventivo) to an end customer — the actual
 * business output of a product-family catalog (see `product-families.ts`).
 * The customer is free-text (name/fiscal code/address), NOT a
 * `companies` row: an end customer is a real-world buyer, not
 * necessarily a company registered on the platform (see the reference
 * quote PDF this was modeled from — client details are plain fields on
 * the document, filled in per quote).
 */
export const quotes = pgTable('quotes', {
  id: uuid('id').defaultRandom().primaryKey(),
  supplierCompanyId: uuid('supplier_company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  reference: text('reference').notNull(),
  status: quoteStatusEnum('status').notNull().default('draft'),
  customerName: text('customer_name').notNull(),
  customerFiscalCode: text('customer_fiscal_code'),
  customerAddress: text('customer_address'),
  customerCity: text('customer_city'),
  projectLocation: text('project_location'),
  introText: text('intro_text'),
  paymentTerms: text('payment_terms'),
  /** Days from issue the quote stays valid — printed on the PDF, not enforced anywhere yet. */
  validityDays: integer('validity_days').notNull().default(30),
  /** Sum of every position's finalPrice, recomputed and stored whenever a position changes — avoids re-summing on every read. */
  totalPrice: numeric('total_price', { precision: 14, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Every RLS-scoped query on this table filters by supplier_company_id (see app_owns_quote / quotes_tenant in 0001_rls.sql).
  supplierCompanyIdx: index('quotes_supplier_company_id_idx').on(table.supplierCompanyId),
}))

/**
 * One line item on a quote — one product-line configuration at a given
 * size/quantity (the PDF's "Pos" rows, e.g. P01, P02). Pricing fields are
 * snapshotted at save time (not recomputed from the live catalog on
 * every read): if the supplier edits the catalog's pricing later,
 * already-issued quotes must not silently change.
 */
export const quotePositions = pgTable('quote_positions', {
  id: uuid('id').defaultRandom().primaryKey(),
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  productFamilyId: uuid('product_family_id')
    .notNull()
    .references(() => productFamilies.id, { onDelete: 'restrict' }),
  productLineId: uuid('product_line_id')
    .notNull()
    .references(() => productLines.id, { onDelete: 'restrict' }),
  /** Snapshotted alongside pricing (see basePrice/finalPrice) — the PDF renderer reads names from here, never re-joining the live catalog, so a later rename doesn't change an already-issued quote and no RLS context is needed to render one. */
  productFamilyName: text('product_family_name').notNull(),
  productLineName: text('product_line_name').notNull(),
  /** "P01", "P02", ... — assigned sequentially within the quote at creation time. */
  positionCode: text('position_code').notNull(),
  quantity: integer('quantity').notNull().default(1),
  widthMm: numeric('width_mm', { precision: 10, scale: 2 }).notNull(),
  heightMm: numeric('height_mm', { precision: 10, scale: 2 }).notNull(),
  /** Free-text description shown on the PDF — pre-filled from the line + chosen characteristics, editable before saving. */
  description: text('description').notNull(),
  unitName: text('unit_name').notNull(),
  unitSymbol: text('unit_symbol').notNull(),
  /** Position-level override on top of the line's own discount/markup (the PDF's "Extra markup %"). */
  discountPct: numeric('discount_pct', { precision: 8, scale: 4 }).notNull().default('0'),
  extraMarkupPct: numeric('extra_markup_pct', { precision: 8, scale: 4 }).notNull().default('100'),
  /** 'manual' means lineManualUnitPrice replaces the formula/matrix result for the product line's own €/unit price — see pricingModeEnum above. Never affects characteristic rows, each of which has its own mode (quotePositionCharacteristics.pricingMode). */
  pricingMode: pricingModeEnum('pricing_mode').notNull().default('auto'),
  /** Only meaningful when pricingMode = 'manual' — the line's own €/unit value the user typed in place of the computed one. */
  lineManualUnitPrice: numeric('line_manual_unit_price', { precision: 14, scale: 4 }),
  totalM2: numeric('total_m2', { precision: 12, scale: 4 }).notNull(),
  /** Line price + every selected characteristic's price, before discount/markup. */
  basePrice: numeric('base_price', { precision: 14, scale: 2 }).notNull(),
  /** basePrice after discountPct and extraMarkupPct — what's actually billed. */
  finalPrice: numeric('final_price', { precision: 14, scale: 2 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // getQuoteDetail/recalculateQuoteTotal filter by quote_id on every position add/remove and every quote read.
  quoteIdIdx: index('quote_positions_quote_id_idx').on(table.quoteId),
}))

/**
 * Which sub-characteristic value was picked for a position, per
 * applicable main characteristic (the PDF's "Colore profilo: Anodizzato
 * argento" rows). One row per main characteristic the position has a
 * choice recorded for; a characteristic the position doesn't touch has
 * no row here at all.
 */
export const quotePositionCharacteristics = pgTable('quote_position_characteristics', {
  id: uuid('id').defaultRandom().primaryKey(),
  quotePositionId: uuid('quote_position_id')
    .notNull()
    .references(() => quotePositions.id, { onDelete: 'cascade' }),
  characteristicId: uuid('characteristic_id')
    .notNull()
    .references(() => characteristics.id, { onDelete: 'restrict' }),
  subCharacteristicId: uuid('sub_characteristic_id')
    .notNull()
    .references(() => characteristics.id, { onDelete: 'restrict' }),
  /** Snapshotted names — see the matching comment on quotePositions. */
  characteristicName: text('characteristic_name').notNull(),
  subCharacteristicName: text('sub_characteristic_name').notNull(),
  /** This selection's own price at save time (0 for a no-cost option) — summed into the position's basePrice. */
  price: numeric('price', { precision: 14, scale: 2 }).notNull().default('0'),
  /** Same 'auto'/'manual' toggle as quotePositions.pricingMode, but scoped to this one characteristic row — independent of the position's own line price and of every other characteristic row on the same position. */
  pricingMode: pricingModeEnum('pricing_mode').notNull().default('auto'),
  /** Only meaningful when pricingMode = 'manual' — this characteristic's own €/unit value the user typed in place of the computed one (pre-quantity, same basis as the formula path — see quotes-service.ts). */
  manualUnitPrice: numeric('manual_unit_price', { precision: 14, scale: 4 }),
}, (table) => ({
  // getQuoteDetail fetches this table once per position on every quote read.
  quotePositionIdIdx: index('quote_position_characteristics_quote_position_id_idx').on(table.quotePositionId),
}))
