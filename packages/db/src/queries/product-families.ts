import { desc, eq, inArray } from 'drizzle-orm'

import type { DbLike } from '../client'
import {
  characteristics,
  pricingMatrices,
  productFamilies,
  productFamilyImages,
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
  matrix: number[][]
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
export const listVisibleProductFamilies = (db: DbLike): Promise<ProductFamilySummary[]> =>
  db.select().from(productFamilies).orderBy(desc(productFamilies.createdAt))

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

export const setProductFamilyPublished = async (
  db: DbLike,
  familyId: string,
  isPublished: boolean,
): Promise<void> => {
  await db
    .update(productFamilies)
    .set({ isPublished, updatedAt: new Date() })
    .where(eq(productFamilies.id, familyId))
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
