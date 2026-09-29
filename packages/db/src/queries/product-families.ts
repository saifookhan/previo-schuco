import { and, desc, eq, exists, inArray, isNotNull, or } from 'drizzle-orm'

import type { DbLike } from '../client'
import {
  characteristics,
  pricingMatrices,
  productFamilies,
  productFamilyImages,
  productLineCharacteristics,
  productLines,
  supplierClientLinks,
} from '../schema'

export interface InsertProductFamilyInput {
  supplierCompanyId: string
  name: string
  technicalName?: string | null
  category?: string | null
  brand?: string | null
  description1?: string | null
  description2?: string | null
  sourceExcelPath?: string | null
  supersedesId?: string | null
  duplicatedFromId?: string | null
  version?: number
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
  unitName: string
  unitSymbol: string
  discountPct: string
  markupPct: string
  installationHoursPerUnit: string
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
  isPublished: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Lists product families visible to the caller — RLS already scopes this
 * (own company's families, plus published families of linked suppliers);
 * no explicit companyId filter needed the way tenant-scoped list queries
 * elsewhere in this codebase use one, since "visible" here isn't simply
 * "belongs to my company."
 * @param db - RLS-scoped transaction
 */
/**
 * Lists families visible to `companyId`: its own, plus published
 * families of suppliers it's linked to as a client. Explicit filter, not
 * RLS alone — `app_is_super_admin()` makes `product_families_select`'s
 * scoping a no-op for a super-admin, including one acting as a specific
 * tenant via `X-Tenant-Id` (ADR 0006 / 0008); mirrors that policy's own
 * `own OR published+linked` condition (minus its super-admin bypass) so
 * a super-admin acting as `companyId` sees exactly what `companyId`
 * itself would.
 */
export const listVisibleProductFamilies = (db: DbLike, companyId: string): Promise<ProductFamilySummary[]> =>
  db
    .select()
    .from(productFamilies)
    .where(
      or(
        eq(productFamilies.supplierCompanyId, companyId),
        and(
          eq(productFamilies.isPublished, true),
          exists(
            db
              .select({ one: supplierClientLinks.supplierCompanyId })
              .from(supplierClientLinks)
              .where(
                and(
                  eq(supplierClientLinks.supplierCompanyId, productFamilies.supplierCompanyId),
                  eq(supplierClientLinks.clientCompanyId, companyId),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(desc(productFamilies.createdAt))

export interface ProductFamilyDetail {
  family: ProductFamilySummary & {
    description1: string | null
    description2: string | null
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
 * Publishes/unpublishes a family. Returns the updated row's id and
 * `supplierCompanyId` (for attributing the audit event to the actual
 * owner, not the caller), or `null` if nothing matched — e.g. RLS
 * silently blocked the UPDATE (a linked client can SELECT a supplier's
 * published family but not update it), which the caller must treat as
 * "not found", not a silent no-op success.
 */
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
  discountPct?: string
  markupPct?: string
  installationHoursPerUnit?: string
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
