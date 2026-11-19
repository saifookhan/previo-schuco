import { sql } from 'drizzle-orm'
import {
  AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './companies'

/**
 * A supplier's product family (Phase 2, project-context.md). Owned by the
 * supplier company — visibility to other companies follows `product_family_shares`
 * (Schuco's own families are visible to everyone per that table's rows,
 * not a special case here) *and* `isPublished` below (a family can be
 * linked to clients but still hidden while a draft/re-import is in
 * progress). Versioned: a new pricing structure means a new row, never an
 * in-place edit of a family a client has already quoted against (see
 * `version`/`supersedesId`).
 */
export const productFamilies = pgTable('product_families', {
  id: uuid('id').defaultRandom().primaryKey(),
  supplierCompanyId: uuid('supplier_company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  technicalName: text('technical_name'),
  category: text('category'),
  brand: text('brand'),
  /** Excel "Descrizione_1" — the real sample workbook has two free-text description fields, not one. */
  description1: text('description_1'),
  /** Excel "Descrizione_2". */
  description2: text('description_2'),
  /** Excel "Note" (v2 template): a free-text note, often a link to technical documentation. */
  note: text('note'),
  /** Excel "Distributore" (v2 template): who the family is bought through, next to its brand. */
  distributor: text('distributor'),
  version: integer('version').notNull().default(1),
  /**
   * Previous version this one replaces, if any — null for the first
   * version of a family lineage. Set when re-importing a materially
   * different pricing structure for an existing family (project-context.md:
   * "create a new product family when pricing structure differs
   * materially"). Distinct from `duplicatedFromId` below: superseding
   * means "this is the new source of truth, the old one is deprecated";
   * duplicating means "this is an independent starting point, both
   * remain live."
   */
  supersedesId: uuid('supersedes_id').references((): AnyPgColumn => productFamilies.id, {
    onDelete: 'set null',
  }),
  /**
   * Family this one was cloned from via the "Duplicate" action, if any —
   * pure lineage/audit trail, no behavioral effect (a duplicate is a
   * fully independent row from the moment it's created).
   */
  duplicatedFromId: uuid('duplicated_from_id').references((): AnyPgColumn => productFamilies.id, {
    onDelete: 'set null',
  }),
  /**
   * Visibility toggle for clients ("allowing a user to see/no-see" —
   * default false so a freshly imported or duplicated family starts
   * hidden until whoever's editing it explicitly publishes it. Company
   * admins/super-users at the supplier can always see their own
   * unpublished families in the admin UI; this only gates what a
   * *client* company sees.
   */
  isPublished: boolean('is_published').notNull().default(false),
  /**
   * "Ready for invoicing": only such families are offered for new quote positions
   * (on top of being published and in price validity). New families start not
   * ready; families that existed before the flag were set ready by its migration.
   */
  readyForInvoicing: boolean('ready_for_invoicing').notNull().default(false),
  /**
   * "Con listino": whether there are prices (a price list) behind the family. Set by
   * hand by the owner, shown as information in the quote builder; it doesn't block anything.
   */
  hasPriceList: boolean('has_price_list').notNull().default(true),
  /**
   * First day (inclusive) this family's prices may be used on new quote positions —
   * set when uploading the Excel. Null on families imported before validity existed:
   * no lower limit.
   */
  priceValidFrom: date('price_valid_from', { mode: 'string' }),
  /** Last day (inclusive) the prices may be used; null = until further notice. */
  priceValidTo: date('price_valid_to', { mode: 'string' }),
  /** Local-disk path for now (see ADR TBD) — swap for an S3 key without a schema change once that's decided. */
  sourceExcelPath: text('source_excel_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check(
    'product_families_price_validity_check',
    sql`${table.priceValidTo} IS NULL OR ${table.priceValidFrom} IS NULL OR ${table.priceValidTo} >= ${table.priceValidFrom}`,
  ),
  // Walking a version chain forward ("which version supersedes this one?").
  index('product_families_supersedes_id_idx').on(table.supersedesId),
  // The copies made from a family (the branches of its version graph).
  index('product_families_duplicated_from_id_idx').on(table.duplicatedFromId),
])

/** A product line (option) under a family — one row per "Product lines" sheet entry. */
export const productLines = pgTable('product_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  productFamilyId: uuid('product_family_id')
    .notNull()
    .references(() => productFamilies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  /** mathjs expression, e.g. "valore * B * H" — evaluated with valore/B/H/ore_di_posa/percentuale. */
  formula: text('formula').notNull().default('valore'),
  /** Fixed base value when pricingMatrixId is null; ignored (but still stored) when it isn't. */
  value: numeric('value', { precision: 14, scale: 4 }).notNull().default('0'),
  /** Set instead of a fixed `value` when this line's price comes from a width/height lookup table. */
  pricingMatrixId: uuid('pricing_matrix_id').references((): AnyPgColumn => pricingMatrices.id, {
    onDelete: 'set null',
  }),
  /** Excel "MinValue" (v2 template): the lowest purchase price per unit — a smaller computed price is raised to it. Null = no minimum. */
  minValue: numeric('min_value', { precision: 14, scale: 4 }),
  unitName: text('unit_name').notNull(),
  unitSymbol: text('unit_symbol').notNull(),
  /** Excel "Sconto %", "MarkUp %" and "Ore di posa x UM". Null = empty in the Excel: 0% discount, 100% markup (none) and 0 hours. */
  discountPct: numeric('discount_pct', { precision: 8, scale: 4 }),
  markupPct: numeric('markup_pct', { precision: 8, scale: 4 }),
  installationHoursPerUnit: numeric('installation_hours_per_unit', { precision: 14, scale: 4 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Loading a family's detail (every version, for the version comparison) reads its rows by family.
  index('product_lines_product_family_id_idx').on(table.productFamilyId),
])

/**
 * Hierarchical characteristic, owned at the FAMILY level — not a single
 * product line. This matches the Excel "Caracteristics" sheet, which
 * isn't scoped to any one product line, and the "Relations" sheet, which
 * is exactly what wires a characteristic to the specific lines it applies
 * to (`productLineCharacteristics` below). A characteristic belonging
 * directly to a line (as the reference implementation this was ported
 * from does) can't represent "this color option applies to 3 of the
 * family's 5 product lines" without duplicating the row per line — this
 * shape can.
 *
 * Self-referencing (`parentId` null = top-level, e.g. "Color"; non-null =
 * a sub-value under it, e.g. "RAL 9010"). A sub-characteristic's own
 * price comes from either `formula`/`value` or `pricingMatrixId`, same
 * shape as a product line's pricing — never both meaningfully at once.
 */
export const characteristics = pgTable('characteristics', {
  id: uuid('id').defaultRandom().primaryKey(),
  productFamilyId: uuid('product_family_id')
    .notNull()
    .references(() => productFamilies.id, { onDelete: 'cascade' }),
  /** Null = top-level characteristic (e.g. "Color"); set = a sub-value under that parent (e.g. "RAL 9010"). */
  parentId: uuid('parent_id').references((): AnyPgColumn => characteristics.id, {
    onDelete: 'cascade',
  }),
  name: text('name').notNull(),
  isApplicable: boolean('is_applicable').notNull().default(true),
  formula: text('formula'),
  value: numeric('value', { precision: 14, scale: 4 }),
  pricingMatrixId: uuid('pricing_matrix_id').references((): AnyPgColumn => pricingMatrices.id, {
    onDelete: 'set null',
  }),
  /**
   * v2 template only, so null on options imported from a v1 workbook (and on main
   * characteristics): the option's own minimum purchase price, discount and markup (both
   * "out of 100", like a line's), and the installation hours it adds to the line's.
   * A null discount/markup means the position's own applies, as before v2.
   */
  minValue: numeric('min_value', { precision: 14, scale: 4 }),
  discountPct: numeric('discount_pct', { precision: 8, scale: 4 }),
  markupPct: numeric('markup_pct', { precision: 8, scale: 4 }),
  installationHoursPerUnit: numeric('installation_hours_per_unit', { precision: 14, scale: 4 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Loading a family's detail (every version, for the version comparison) reads its rows by family.
  index('characteristics_product_family_id_idx').on(table.productFamilyId),
])

/**
 * A width×height price lookup table (the Excel "matrix sheet" a product
 * line or characteristic can point to instead of a fixed value/formula).
 * `widths`/`heights` are sorted ascending; `matrix[heightIndex][widthIndex]`
 * is the price. Lookup is nearest-match-at-or-above, matching the
 * reference implementation (`compute2DValue`).
 */
export const pricingMatrices = pgTable('pricing_matrices', {
  id: uuid('id').defaultRandom().primaryKey(),
  productFamilyId: uuid('product_family_id')
    .notNull()
    .references(() => productFamilies.id, { onDelete: 'cascade' }),
  widths: jsonb('widths').notNull().$type<number[]>(),
  heights: jsonb('heights').notNull().$type<number[]>(),
  matrix: jsonb('matrix').notNull().$type<(number | null)[][]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Loading a family's detail (every version, for the version comparison) reads its rows by family.
  index('pricing_matrices_product_family_id_idx').on(table.productFamilyId),
])

/**
 * Which characteristics apply to which product line (the Excel "Relations"
 * sheet) — a product line only offers the subset of its family's
 * characteristics listed here, not every characteristic that exists
 * anywhere in the family.
 */
export const productLineCharacteristics = pgTable(
  'product_line_characteristics',
  {
    productLineId: uuid('product_line_id')
      .notNull()
      .references(() => productLines.id, { onDelete: 'cascade' }),
    characteristicId: uuid('characteristic_id')
      .notNull()
      .references(() => characteristics.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.productLineId, table.characteristicId] })],
)

/**
 * A product family's marketing images (Excel "Immagine_1/2/3" — embedded
 * images inside the .xlsx, not cell values; extracted separately from the
 * rest of the sheet via `extract-embedded-images.ts` since the `xlsx`
 * library only reads cell values, not drawings). `localPath` for now
 * (matches `productFamilies.sourceExcelPath`'s local-disk-first
 * approach) — an unbounded list rather than 3 fixed columns, since the
 * sample workbook already has exactly 3 but nothing guarantees that
 * stays true for every supplier's file.
 */
export const productFamilyImages = pgTable('product_family_images', {
  id: uuid('id').defaultRandom().primaryKey(),
  productFamilyId: uuid('product_family_id')
    .notNull()
    .references(() => productFamilies.id, { onDelete: 'cascade' }),
  title: text('title'),
  localPath: text('local_path').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Loading a family's detail (every version, for the version comparison) reads its rows by family.
  index('product_family_images_product_family_id_idx').on(table.productFamilyId),
])

/**
 * What changed from one family to another (a version and the one before it, or a copy and its
 * original), detected from their content when the newer one is created, recomputed when either
 * one's content is edited, and kept so it isn't recomputed on every view. `changes` is the
 * contracts' `FamilyChangeNode[]`. A row made by an older `diffVersion` of the diff code is
 * ignored (and recomputed by the backfill script).
 */
export const productFamilyChanges = pgTable(
  'product_family_changes',
  {
    productFamilyId: uuid('product_family_id')
      .notNull()
      .references(() => productFamilies.id, { onDelete: 'cascade' }),
    fromFamilyId: uuid('from_family_id')
      .notNull()
      .references(() => productFamilies.id, { onDelete: 'cascade' }),
    diffVersion: integer('diff_version').notNull(),
    changes: jsonb('changes').notNull().$type<unknown[]>(),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.productFamilyId, table.fromFamilyId] }),
    // Edits refresh the rows a family is the older side of; deleting it cascades by this column.
    index('product_family_changes_from_family_id_idx').on(table.fromFamilyId),
  ],
)
