import {
  AnyPgColumn,
  boolean,
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
 * supplier company — visibility to clients follows `supplier_client_links`
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
  /** Local-disk path for now (see ADR TBD) — swap for an S3 key without a schema change once that's decided. */
  sourceExcelPath: text('source_excel_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

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
  unitName: text('unit_name').notNull(),
  unitSymbol: text('unit_symbol').notNull(),
  discountPct: numeric('discount_pct', { precision: 8, scale: 4 }).notNull().default('0'),
  markupPct: numeric('markup_pct', { precision: 8, scale: 4 }).notNull().default('100'),
  installationHoursPerUnit: numeric('installation_hours_per_unit', { precision: 14, scale: 4 })
    .notNull()
    .default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

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
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

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
  matrix: jsonb('matrix').notNull().$type<number[][]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

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
})
