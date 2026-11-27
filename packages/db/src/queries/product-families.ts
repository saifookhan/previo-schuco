import { and, asc, desc, eq, getTableColumns, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

import type { DbLike } from '../client'
import {
  characteristics,
  companyDirectory,
  pricingMatrices,
  productFamilies,
  productFamilyChanges,
  productFamilyImages,
  productFamilyFavorites,
  productFamilyLibraryHidden,
  productLineCharacteristics,
  productLines,
} from '../schema'

export interface InsertProductFamilyInput {
  supplierCompanyId: string
  name: string
  technicalName?: string | null
  category?: string | null
  brand?: string | null
  description1?: string | null
  description2?: string | null
  note?: string | null
  distributor?: string | null
  sourceExcelPath?: string | null
  supersedesId?: string | null
  duplicatedFromId?: string | null
  version?: number
  priceValidFrom?: string | null
  priceValidTo?: string | null
  isPublished?: boolean
  readyForInvoicing?: boolean
  hasPriceList?: boolean
}

/** Creates a product family row. Draft (`isPublished: false`) by default — the caller publishes explicitly once ready. */
export const insertProductFamily = async (db: DbLike, input: InsertProductFamilyInput): Promise<string> => {
  const [row] = await db.insert(productFamilies).values(input).returning({ id: productFamilies.id })
  return row.id
}

export interface InsertPricingMatrixInput {
  productFamilyId: string
  widths: number[]
  heights: number[]
  matrix: (number | null)[][]
}

export const insertPricingMatrix = async (db: DbLike, input: InsertPricingMatrixInput): Promise<string> => {
  const [row] = await db.insert(pricingMatrices).values(input).returning({ id: pricingMatrices.id })
  return row.id
}

export interface InsertProductLineInput {
  productFamilyId: string
  name: string
  description?: string | null
  formula: string
  value: string
  pricingMatrixId?: string | null
  minValue?: string | null
  unitName: string
  unitSymbol: string
  discountPct: string | null
  markupPct: string | null
  installationHoursPerUnit: string | null
  sortOrder: number
}

export const insertProductLine = async (db: DbLike, input: InsertProductLineInput): Promise<string> => {
  const [row] = await db.insert(productLines).values(input).returning({ id: productLines.id })
  return row.id
}

export interface InsertCharacteristicInput {
  productFamilyId: string
  parentId?: string | null
  name: string
  isApplicable?: boolean
  formula?: string | null
  value?: string | null
  pricingMatrixId?: string | null
  minValue?: string | null
  discountPct?: string | null
  markupPct?: string | null
  installationHoursPerUnit?: string | null
  sortOrder: number
}

export const insertCharacteristic = async (db: DbLike, input: InsertCharacteristicInput): Promise<string> => {
  const [row] = await db.insert(characteristics).values(input).returning({ id: characteristics.id })
  return row.id
}

export const insertProductLineCharacteristic = async (
  db: DbLike,
  productLineId: string,
  characteristicId: string,
): Promise<void> => {
  await db.insert(productLineCharacteristics).values({ productLineId, characteristicId })
}

export interface InsertProductFamilyImageInput {
  productFamilyId: string
  title?: string | null
  localPath: string
  sortOrder: number
}

export const insertProductFamilyImage = async (
  db: DbLike,
  input: InsertProductFamilyImageInput,
): Promise<string> => {
  const [row] = await db
    .insert(productFamilyImages)
    .values(input)
    .returning({ id: productFamilyImages.id })
  return row.id
}

export interface ProductFamilySummary {
  id: string
  supplierCompanyId: string
  name: string
  technicalName: string | null
  category: string | null
  brand: string | null
  version: number
  supersedesId: string | null
  /** The family this one was copied from with "Duplicate" (pure lineage); null for an import or new version. */
  duplicatedFromId: string | null
  isPublished: boolean
  /** Only families ready for invoicing are offered for new quote positions. */
  readyForInvoicing: boolean
  /** "Con listino": there are prices behind the family. Information only. */
  hasPriceList: boolean
  /** ISO date (`YYYY-MM-DD`), inclusive; null = no lower limit. */
  priceValidFrom: string | null
  /** ISO date (`YYYY-MM-DD`), inclusive; null = until further notice. */
  priceValidTo: string | null
  /** Set when a company admin archives this version. Other versions of the chain stay as they are. */
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ProductFamilyListItem extends ProductFamilySummary {
  /** Name of the company that owns the family; null if the caller cannot read that company. */
  ownerCompanyName: string | null
  /** The highest discount the share of the family with the caller gives on any line or option; null for the caller's own families. */
  shareDiscountPct: number | null
  /** Whether the family is in the listing company's library ("In libreria"). */
  inLibrary: boolean
  /** Whether the listing company has marked this version as a favorite. */
  isFavorite: boolean
}

/**
 * Lists families visible to `companyId`: its own, plus published families
 * that reach it through the share chain. Explicit filter, not RLS alone —
 * `app_is_super_admin()` makes `product_families_select`'s scoping a no-op
 * for a super-admin, including one acting as a specific tenant via
 * `X-Tenant-Id` (ADR 0006 / 0008); mirrors that policy's own
 * `own OR published+reachable` condition (minus its super-admin bypass) so
 * a super-admin acting as `companyId` sees exactly what `companyId`
 * itself would.
 */
export const listVisibleProductFamilies = (
  db: DbLike,
  companyId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<ProductFamilyListItem[]> => {
  const visible = or(
    eq(productFamilies.supplierCompanyId, companyId),
    and(
      eq(productFamilies.isPublished, true),
      sql`app_family_reaches_company(${productFamilies.id}, ${companyId}::uuid)`,
    ),
  )
  return db
    .select({
      ...getTableColumns(productFamilies),
      ownerCompanyName: companyDirectory.name,
      shareDiscountPct: sql<number | null>`(
        SELECT max(i.discount_pct)::float FROM product_family_share_items i
        WHERE i.share_id = (
          -- The share that applies, as getIncomingShareItems picks it: the owner's, else the first one made.
          SELECT s.id FROM product_family_shares s
          WHERE s.product_family_id = ${productFamilies.id} AND s.to_company_id = ${companyId}::uuid
            AND app_family_reaches_company(s.product_family_id, s.from_company_id)
          ORDER BY s.from_company_id = ${productFamilies.supplierCompanyId} DESC, s.created_at, s.id
          LIMIT 1
        )
      )`,
      inLibrary: sql<boolean>`NOT EXISTS (
        SELECT 1 FROM product_family_library_hidden h
        WHERE h.company_id = ${companyId}::uuid AND h.product_family_id = ${productFamilies.id}
      )`,
      isFavorite: sql<boolean>`EXISTS (
        SELECT 1 FROM product_family_favorites f
        WHERE f.company_id = ${companyId}::uuid AND f.product_family_id = ${productFamilies.id}
      )`,
    })
    .from(productFamilies)
    .leftJoin(companyDirectory, eq(productFamilies.supplierCompanyId, companyDirectory.id))
    .where(includeArchived ? visible : and(visible, isNull(productFamilies.archivedAt)))
    .orderBy(desc(productFamilies.createdAt))
}

export interface ProductLineName {
  id: string
  productFamilyId: string
  name: string
  unitSymbol: string
}

/** Names of the lines in the given families. The caller has already decided which families are visible. */
export const listProductLineNames = (db: DbLike, familyIds: string[]): Promise<ProductLineName[]> =>
  familyIds.length === 0
    ? Promise.resolve([])
    : db
        .select({
          id: productLines.id,
          productFamilyId: productLines.productFamilyId,
          name: productLines.name,
          unitSymbol: productLines.unitSymbol,
        })
        .from(productLines)
        .where(inArray(productLines.productFamilyId, familyIds))
        .orderBy(asc(productLines.sortOrder), asc(productLines.name))

export interface ProductFamilyDetail {
  family: ProductFamilySummary & {
    description1: string | null
    description2: string | null
    note: string | null
    distributor: string | null
    sourceExcelPath: string | null
    supersedesId: string | null
    duplicatedFromId: string | null
  }
  images: (typeof productFamilyImages.$inferSelect)[]
  lines: (typeof productLines.$inferSelect)[]
  characteristics: (typeof characteristics.$inferSelect)[]
  matrices: (typeof pricingMatrices.$inferSelect)[]
  relations: { productLineId: string; characteristicId: string }[]
}

/**
 * Loads a product family with every related row (lines, characteristics,
 * matrices, relations, images) — everything a detail/edit view or the
 * costing engine needs, in one call. RLS scopes each table independently;
 * a caller who can't see the family gets an empty result on every nested
 * query too (the same policy chain), not an error.
 * @param db - RLS-scoped transaction
 * @param familyId - Product family id
 */
export const getProductFamilyDetail = async (
  db: DbLike,
  familyId: string,
): Promise<ProductFamilyDetail | null> => {
  const [family] = await db.select().from(productFamilies).where(eq(productFamilies.id, familyId))
  if (!family) {
    return null
  }

  const [images, lines, characteristicRows, matrices] = await Promise.all([
    db.select().from(productFamilyImages).where(eq(productFamilyImages.productFamilyId, familyId)),
    db.select().from(productLines).where(eq(productLines.productFamilyId, familyId)),
    db.select().from(characteristics).where(eq(characteristics.productFamilyId, familyId)),
    db.select().from(pricingMatrices).where(eq(pricingMatrices.productFamilyId, familyId)),
  ])

  const lineIds = lines.map((line) => line.id)
  const relations = lineIds.length
    ? await db
        .select({
          productLineId: productLineCharacteristics.productLineId,
          characteristicId: productLineCharacteristics.characteristicId,
        })
        .from(productLineCharacteristics)
        .where(inArray(productLineCharacteristics.productLineId, lineIds))
    : []

  return {
    family,
    images,
    lines,
    characteristics: characteristicRows,
    matrices,
    relations,
  }
}

/**
 * Walks forward through a version chain (each version's `supersedesId`
 * points at its immediate predecessor) starting at `familyId`, returning
 * whichever version has no newer version pointing at it — i.e. the tip
 * of the chain. Given any version in a lineage, this always resolves to
 * the same latest version, so "create a new version" converges to
 * extending one linear chain no matter which existing version you start
 * from, instead of re-deriving the same next-version number every time.
 * @param db - RLS-scoped transaction
 * @param familyId - Any version in the chain to start walking from
 */
export const findLatestProductFamilyVersion = async (
  db: DbLike,
  familyId: string,
): Promise<ProductFamilySummary> => {
  const [start] = await db.select().from(productFamilies).where(eq(productFamilies.id, familyId))
  let latest = start
  while (latest) {
    const [next] = await db.select().from(productFamilies).where(eq(productFamilies.supersedesId, latest.id))
    if (!next) {
      break
    }
    latest = next
  }
  return latest
}

/**
 * Every version in `familyId`'s chain that the caller can see, oldest first. The chain
 * comes from `app_family_version_chain` (it sees past versions the caller can't, and is
 * empty when the caller can't see `familyId` itself); the rows are read under the
 * caller's RLS, so a recipient only gets the published ones.
 * @param db - RLS-scoped transaction
 * @param familyId - Any version in the chain
 */
export const listProductFamilyVersions = (db: DbLike, familyId: string): Promise<ProductFamilySummary[]> =>
  db
    .select()
    .from(productFamilies)
    .where(sql`${productFamilies.id} IN (SELECT app_family_version_chain(${familyId}::uuid))`)
    .orderBy(asc(productFamilies.version), asc(productFamilies.createdAt))

/**
 * Locks every version in `familyId`'s chain (that the caller may update) until the transaction
 * ends, so two saves that each check the chain's dates can't both pass. Re-read the chain in a
 * later statement: under READ COMMITTED that one sees what the other save committed.
 * @param db - RLS-scoped transaction
 * @param familyId - Any version in the chain
 */
export const lockProductFamilyVersions = async (db: DbLike, familyId: string): Promise<void> => {
  await db
    .select({ id: productFamilies.id })
    .from(productFamilies)
    .where(sql`${productFamilies.id} IN (SELECT app_family_version_chain(${familyId}::uuid))`)
    .for('update')
}

/**
 * The chains of all of `familyIds` in one query, keyed by the id each was asked for: every version
 * the caller can see, oldest first (same rules as `listProductFamilyVersions`). Keyed rather than
 * left to the caller to link up by `supersedesId`, since a version the caller can't see would
 * split a chain in two.
 * @param db - RLS-scoped transaction
 * @param familyIds - One version of each chain
 */
export const listProductFamilyVersionsOfChains = async (
  db: DbLike,
  familyIds: string[],
): Promise<Map<string, ProductFamilySummary[]>> => {
  const chains = new Map<string, ProductFamilySummary[]>()
  if (!familyIds.length) return chains
  const rows = await db
    .select({ chainOf: sql<string>`c.f`, ...getTableColumns(productFamilies) })
    .from(productFamilies)
    .innerJoin(
      sql`(SELECT f, app_family_version_chain(f) AS chain_id FROM unnest(ARRAY[${sql.join(
        familyIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]) AS f) AS c`,
      sql`c.chain_id = ${productFamilies.id}`,
    )
    .orderBy(asc(productFamilies.version), asc(productFamilies.createdAt))
  for (const { chainOf, ...family } of rows) {
    chains.set(chainOf, [...(chains.get(chainOf) ?? []), family])
  }
  return chains
}

/**
 * Families copied ("Duplicate") from any of `sourceIds` that the caller can see, oldest first —
 * the branches of the version graph.
 * @param db - RLS-scoped transaction
 * @param sourceIds - Family ids the copies were made from
 */
export const listProductFamilyCopies = (db: DbLike, sourceIds: string[]): Promise<ProductFamilySummary[]> =>
  sourceIds.length
    ? db
        .select()
        .from(productFamilies)
        .where(inArray(productFamilies.duplicatedFromId, sourceIds))
        .orderBy(asc(productFamilies.createdAt))
    : Promise.resolve([])

/**
 * Publishes/unpublishes a family. Returns the updated row's id and
 * `supplierCompanyId` (for attributing the audit event to the actual
 * owner, not the caller), or `null` if nothing matched — e.g. RLS
 * silently blocked the UPDATE (a linked client can SELECT a supplier's
 * published family but not update it), which the caller must treat as
 * "not found", not a silent no-op success.
 */
/** Archives or restores a family row (one version). Returns null when the row isn't visible to update. */
export const setProductFamilyArchivedAt = async (
  db: DbLike,
  familyId: string,
  archivedAt: Date | null,
): Promise<{ id: string; supplierCompanyId: string } | null> => {
  const [updated] = await db
    .update(productFamilies)
    .set({ archivedAt, updatedAt: new Date() })
    .where(eq(productFamilies.id, familyId))
    .returning({ id: productFamilies.id, supplierCompanyId: productFamilies.supplierCompanyId })
  return updated ?? null
}

export const setProductFamilyPublished = async (
  db: DbLike,
  familyId: string,
  isPublished: boolean,
): Promise<{ id: string; supplierCompanyId: string } | null> => {
  const [updated] = await db
    .update(productFamilies)
    .set({ isPublished, updatedAt: new Date() })
    .where(eq(productFamilies.id, familyId))
    .returning({ id: productFamilies.id, supplierCompanyId: productFamilies.supplierCompanyId })
  return updated ?? null
}

/**
 * Marks a family ready (or not) for invoicing. Same contract as
 * `setProductFamilyPublished`: `null` when nothing matched, including when RLS
 * blocked the UPDATE because the caller doesn't own it.
 */
export const setProductFamilyReadyForInvoicing = async (
  db: DbLike,
  familyId: string,
  readyForInvoicing: boolean,
): Promise<{ id: string; supplierCompanyId: string } | null> => {
  const [updated] = await db
    .update(productFamilies)
    .set({ readyForInvoicing, updatedAt: new Date() })
    .where(eq(productFamilies.id, familyId))
    .returning({ id: productFamilies.id, supplierCompanyId: productFamilies.supplierCompanyId })
  return updated ?? null
}

/**
 * Sets whether the family has a price list ("Con listino"). Same contract as
 * `setProductFamilyPublished`: `null` when nothing matched, including when RLS
 * blocked the UPDATE because the caller doesn't own it.
 */
export const setProductFamilyHasPriceList = async (
  db: DbLike,
  familyId: string,
  hasPriceList: boolean,
): Promise<{ id: string; supplierCompanyId: string } | null> => {
  const [updated] = await db
    .update(productFamilies)
    .set({ hasPriceList, updatedAt: new Date() })
    .where(eq(productFamilies.id, familyId))
    .returning({ id: productFamilies.id, supplierCompanyId: productFamilies.supplierCompanyId })
  return updated ?? null
}

/** Whether `familyId` is in `companyId`'s library — true unless the company took it out. */
export const isProductFamilyInLibrary = async (db: DbLike, companyId: string, familyId: string): Promise<boolean> => {
  const [hidden] = await db
    .select({ companyId: productFamilyLibraryHidden.companyId })
    .from(productFamilyLibraryHidden)
    .where(and(eq(productFamilyLibraryHidden.companyId, companyId), eq(productFamilyLibraryHidden.productFamilyId, familyId)))
  return !hidden
}

/** Of `familyIds`, the ones the company took out of its library (one query for many families). */
export const listFamiliesHiddenFromLibrary = async (db: DbLike, companyId: string, familyIds: string[]): Promise<Set<string>> => {
  if (familyIds.length === 0) return new Set()
  const rows = await db
    .select({ id: productFamilyLibraryHidden.productFamilyId })
    .from(productFamilyLibraryHidden)
    .where(and(eq(productFamilyLibraryHidden.companyId, companyId), inArray(productFamilyLibraryHidden.productFamilyId, familyIds)))
  return new Set(rows.map((row) => row.id))
}

/**
 * Puts a family back in, or takes it out of, a company's library. Idempotent.
 * RLS only lets a company write its own rows, for families it can see.
 */
/** Marks or clears this company's favorite on one family version. Other versions stay as they are. */
export const setProductFamilyFavorite = async (
  db: DbLike,
  input: { companyId: string; familyId: string; favorite: boolean },
): Promise<void> => {
  if (!input.favorite) {
    await db
      .delete(productFamilyFavorites)
      .where(and(eq(productFamilyFavorites.companyId, input.companyId), eq(productFamilyFavorites.productFamilyId, input.familyId)))
    return
  }
  await db
    .insert(productFamilyFavorites)
    .values({ companyId: input.companyId, productFamilyId: input.familyId })
    .onConflictDoNothing()
}

export const setProductFamilyInLibrary = async (
  db: DbLike,
  input: { companyId: string; familyId: string; inLibrary: boolean; userId: string | null },
): Promise<void> => {
  if (input.inLibrary) {
    await db
      .delete(productFamilyLibraryHidden)
      .where(
        and(eq(productFamilyLibraryHidden.companyId, input.companyId), eq(productFamilyLibraryHidden.productFamilyId, input.familyId)),
      )
    return
  }
  await db
    .insert(productFamilyLibraryHidden)
    .values({ companyId: input.companyId, productFamilyId: input.familyId, hiddenByUserId: input.userId })
    .onConflictDoNothing()
}

/**
 * Sets the days a family's prices may be used on new quote positions. Same
 * contract as `setProductFamilyPublished`: `null` when nothing matched,
 * including when RLS blocked the UPDATE because the caller doesn't own it.
 */
export const setProductFamilyPriceValidity = async (
  db: DbLike,
  familyId: string,
  validity: { priceValidFrom: string; priceValidTo: string | null },
): Promise<{ id: string; supplierCompanyId: string } | null> => {
  const [updated] = await db
    .update(productFamilies)
    .set({ ...validity, updatedAt: new Date() })
    .where(eq(productFamilies.id, familyId))
    .returning({ id: productFamilies.id, supplierCompanyId: productFamilies.supplierCompanyId })
  return updated ?? null
}

/**
 * Deletes a product family. RLS restricts this to the owning supplier
 * company (or a super-admin) — see `product_families_delete` in
 * `migrations/0001_rls.sql`. Child rows (lines, characteristics, pricing
 * matrices, images, line/characteristic relations) cascade-delete via FK
 * `ON DELETE CASCADE`, so no explicit cleanup is needed here.
 * @param db - RLS-scoped transaction
 * @param familyId - Product family to delete
 * @returns true if a row was actually deleted (false if it didn't exist or wasn't visible under RLS)
 */
export const deleteProductFamily = async (db: DbLike, familyId: string): Promise<boolean> => {
  const deleted = await db
    .delete(productFamilies)
    .where(eq(productFamilies.id, familyId))
    .returning({ id: productFamilies.id })
  return deleted.length > 0
}

/** Loads one family's summary row (no children) — for cheap existence/ownership/state checks. RLS-scoped: null if it doesn't exist or isn't visible. */
export const getProductFamilyById = async (
  db: DbLike,
  familyId: string,
): Promise<ProductFamilySummary | null> => {
  const [family] = await db.select().from(productFamilies).where(eq(productFamilies.id, familyId))
  return family ?? null
}

/** Batch publish-status lookup for a set of family ids (e.g. flagging quote positions whose catalog family is no longer published). Ids not found are simply absent from the map. */
export const getProductFamiliesPublishStatus = async (
  db: DbLike,
  familyIds: string[],
): Promise<Map<string, boolean>> => {
  if (familyIds.length === 0) {
    return new Map()
  }
  const rows = await db
    .select({ id: productFamilies.id, isPublished: productFamilies.isPublished })
    .from(productFamilies)
    .where(inArray(productFamilies.id, familyIds))
  return new Map(rows.map((row) => [row.id, row.isPublished]))
}

export type StoredFamilyChanges = typeof productFamilyChanges.$inferSelect

/** The stored change lists of these families (as the newer side), from any older family. RLS-scoped. */
export const listStoredFamilyChanges = async (db: DbLike, familyIds: string[]): Promise<StoredFamilyChanges[]> => {
  if (familyIds.length === 0) {
    return []
  }
  return db.select().from(productFamilyChanges).where(inArray(productFamilyChanges.productFamilyId, familyIds))
}

/** The stored change lists a family is either side of — what its edits make out of date. RLS-scoped. */
export const listFamilyChangesInvolving = async (db: DbLike, familyId: string): Promise<StoredFamilyChanges[]> =>
  db
    .select()
    .from(productFamilyChanges)
    .where(or(eq(productFamilyChanges.productFamilyId, familyId), eq(productFamilyChanges.fromFamilyId, familyId)))

/** Every family that is a later version or a copy, with the family it replaces or was copied from. RLS-scoped. */
export const listFamilyPredecessors = (db: DbLike) =>
  db
    .select({ id: productFamilies.id, supersedesId: productFamilies.supersedesId, duplicatedFromId: productFamilies.duplicatedFromId })
    .from(productFamilies)
    .where(or(isNotNull(productFamilies.supersedesId), isNotNull(productFamilies.duplicatedFromId)))

/** Stores (or replaces) the change list from `fromFamilyId` to `productFamilyId`. */
export const saveFamilyChanges = async (
  db: DbLike,
  input: Pick<StoredFamilyChanges, 'productFamilyId' | 'fromFamilyId' | 'diffVersion' | 'changes'>,
): Promise<void> => {
  await db
    .insert(productFamilyChanges)
    .values(input)
    .onConflictDoUpdate({
      target: [productFamilyChanges.productFamilyId, productFamilyChanges.fromFamilyId],
      set: { diffVersion: input.diffVersion, changes: input.changes, computedAt: new Date() },
    })
}

/** Bumps a family's `updatedAt` — call after editing any of its children. */
export const touchProductFamily = async (db: DbLike, familyId: string): Promise<void> => {
  await db.update(productFamilies).set({ updatedAt: new Date() }).where(eq(productFamilies.id, familyId))
}

export type PricingMatrixRow = typeof pricingMatrices.$inferSelect
export type ProductLineRow = typeof productLines.$inferSelect
export type CharacteristicRow = typeof characteristics.$inferSelect

export interface UpdatePricingMatrixInput {
  widths: number[]
  heights: number[]
  matrix: (number | null)[][]
}

/**
 * Replaces a pricing matrix's axes and cells. `familyId` is part of the
 * WHERE so a matrix id from another family can't be edited through this
 * family's URL (RLS separately guarantees only the owning supplier can
 * write at all).
 * @returns the updated row, or null if no such matrix exists in that family / it isn't writable
 */
export const updatePricingMatrix = async (
  db: DbLike,
  familyId: string,
  matrixId: string,
  input: UpdatePricingMatrixInput,
): Promise<PricingMatrixRow | null> => {
  const [row] = await db
    .update(pricingMatrices)
    .set(input)
    .where(and(eq(pricingMatrices.id, matrixId), eq(pricingMatrices.productFamilyId, familyId)))
    .returning()
  return row ?? null
}

export interface UpdateProductLineInput {
  formula?: string
  value?: string
  discountPct?: string | null
  markupPct?: string | null
  installationHoursPerUnit?: string | null
}

/** Updates a product line's pricing fields. Returns null if the line isn't in that family / isn't writable. */
export const updateProductLine = async (
  db: DbLike,
  familyId: string,
  lineId: string,
  input: UpdateProductLineInput,
): Promise<ProductLineRow | null> => {
  const [row] = await db
    .update(productLines)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(productLines.id, lineId), eq(productLines.productFamilyId, familyId)))
    .returning()
  return row ?? null
}

export interface UpdateCharacteristicInput {
  formula?: string | null
  value?: string | null
}

/**
 * Updates a *sub*-characteristic's pricing fields. Top-level
 * characteristics (parentId null) carry no price of their own, so they're
 * excluded here — returns null for those, same as for a missing row.
 */
export const updateCharacteristic = async (
  db: DbLike,
  familyId: string,
  characteristicId: string,
  input: UpdateCharacteristicInput,
): Promise<CharacteristicRow | null> => {
  const [row] = await db
    .update(characteristics)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(
        eq(characteristics.id, characteristicId),
        eq(characteristics.productFamilyId, familyId),
        isNotNull(characteristics.parentId),
      ),
    )
    .returning()
  return row ?? null
}
