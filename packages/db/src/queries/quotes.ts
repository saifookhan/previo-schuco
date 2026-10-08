import { and, desc, eq, inArray } from 'drizzle-orm'

import type { DbLike } from '../client'
import { quotePositionCharacteristics, quotePositions, quotes } from '../schema'

export interface InsertQuoteInput {
  supplierCompanyId: string
  createdByUserId?: string | null
  reference: string
  customerName: string
  customerFiscalCode?: string | null
  customerAddress?: string | null
  customerCity?: string | null
  projectLocation?: string | null
  introText?: string | null
  paymentTerms?: string | null
  validityDays?: number
}

export const insertQuote = async (db: DbLike, input: InsertQuoteInput): Promise<string> => {
  const [row] = await db.insert(quotes).values(input).returning({ id: quotes.id })
  return row.id
}

export interface InsertQuotePositionInput {
  quoteId: string
  productFamilyId: string
  productLineId: string
  productFamilyName: string
  productLineName: string
  positionCode: string
  quantity: number
  widthMm: string
  heightMm: string
  description: string
  unitName: string
  unitSymbol: string
  discountPct: string
  extraMarkupPct: string
  /** Omit for the normal formula/matrix-computed path — see schema's pricingModeEnum comment. */
  pricingMode?: 'auto' | 'manual'
  lineManualUnitPrice?: string | null
  totalM2: string
  basePrice: string
  finalPrice: string
  sortOrder: number
}

export const insertQuotePosition = async (db: DbLike, input: InsertQuotePositionInput): Promise<string> => {
  const [row] = await db.insert(quotePositions).values(input).returning({ id: quotePositions.id })
  return row.id
}

export interface InsertQuotePositionCharacteristicInput {
  quotePositionId: string
  characteristicId: string
  subCharacteristicId: string
  characteristicName: string
  subCharacteristicName: string
  price: string
  pricingMode?: 'auto' | 'manual'
  manualUnitPrice?: string | null
}

export const insertQuotePositionCharacteristic = async (
  db: DbLike,
  input: InsertQuotePositionCharacteristicInput,
): Promise<void> => {
  await db.insert(quotePositionCharacteristics).values(input)
}

export type QuoteSummary = typeof quotes.$inferSelect

/** Lists this caller's own quotes (RLS-scoped), most recent first. */
/**
 * Lists quotes for `companyId`, most recent first. Explicit filter, not
 * RLS alone — `app_is_super_admin()` makes `quotes_tenant`'s
 * `supplier_company_id = app_current_company_id()` a no-op for a
 * super-admin, including one acting as a specific tenant via
 * `X-Tenant-Id` (ADR 0006 / 0008; same reasoning as `listUsers`).
 */
export const listQuotes = (db: DbLike, companyId: string): Promise<QuoteSummary[]> =>
  db.select().from(quotes).where(eq(quotes.supplierCompanyId, companyId)).orderBy(desc(quotes.createdAt))

export type QuotePositionRow = typeof quotePositions.$inferSelect
export type QuotePositionCharacteristicRow = typeof quotePositionCharacteristics.$inferSelect

export interface QuoteDetail {
  quote: QuoteSummary
  positions: (QuotePositionRow & { characteristics: QuotePositionCharacteristicRow[] })[]
}

/** Loads one quote with every position and each position's selected characteristics, in position order. */
export const getQuoteDetail = async (db: DbLike, quoteId: string): Promise<QuoteDetail | null> => {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId))
  if (!quote) {
    return null
  }

  const positionRows = await db
    .select()
    .from(quotePositions)
    .where(eq(quotePositions.quoteId, quoteId))
    .orderBy(quotePositions.sortOrder)

  const characteristicRows = positionRows.length
    ? await db
        .select()
        .from(quotePositionCharacteristics)
        .where(
          inArray(
            quotePositionCharacteristics.quotePositionId,
            positionRows.map((p) => p.id),
          ),
        )
    : []
  const characteristicsByPositionId = new Map<string, QuotePositionCharacteristicRow[]>()
  for (const row of characteristicRows) {
    const list = characteristicsByPositionId.get(row.quotePositionId) ?? []
    list.push(row)
    characteristicsByPositionId.set(row.quotePositionId, list)
  }

  const positions = positionRows.map((position) => ({
    ...position,
    characteristics: characteristicsByPositionId.get(position.id) ?? [],
  }))

  return { quote, positions }
}

/** Recomputes and stores a quote's totalPrice as the sum of its positions' finalPrice. Call after any position add/edit/remove. */
export const recalculateQuoteTotal = async (db: DbLike, quoteId: string): Promise<void> => {
  const positionRows = await db
    .select({ finalPrice: quotePositions.finalPrice })
    .from(quotePositions)
    .where(eq(quotePositions.quoteId, quoteId))
  const total = positionRows.reduce((sum, row) => sum + Number(row.finalPrice), 0)
  await db
    .update(quotes)
    .set({ totalPrice: total.toFixed(2), updatedAt: new Date() })
    .where(eq(quotes.id, quoteId))
}

/** Deletes a position, but only if it belongs to `quoteId` — scoped in the WHERE itself, not just checked after the fact. */
export const deleteQuotePosition = async (db: DbLike, quoteId: string, positionId: string): Promise<string | null> => {
  const [row] = await db
    .delete(quotePositions)
    .where(and(eq(quotePositions.id, positionId), eq(quotePositions.quoteId, quoteId)))
    .returning({ quoteId: quotePositions.quoteId })
  return row?.quoteId ?? null
}

export interface UpdateQuotePositionInput {
  productFamilyId: string
  productLineId: string
  productFamilyName: string
  productLineName: string
  quantity: number
  widthMm: string
  heightMm: string
  description: string
  unitName: string
  unitSymbol: string
  discountPct: string
  extraMarkupPct: string
  pricingMode?: 'auto' | 'manual'
  lineManualUnitPrice?: string | null
  totalM2: string
  basePrice: string
  finalPrice: string
}

/**
 * Updates an existing position's fields in place — positionCode and
 * sortOrder are deliberately not touched (editing never reorders or
 * renumbers). Scoped by `quoteId` in the WHERE itself, same as
 * `deleteQuotePosition`, so a positionId from another quote is a no-op,
 * never a cross-quote write.
 */
export const updateQuotePosition = async (
  db: DbLike,
  quoteId: string,
  positionId: string,
  input: UpdateQuotePositionInput,
): Promise<void> => {
  await db
    .update(quotePositions)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(quotePositions.id, positionId), eq(quotePositions.quoteId, quoteId)))
}

/** Deletes every characteristic row for one position — used by an edit (update position) to clear old selections before inserting the new set. */
export const deleteQuotePositionCharacteristics = async (db: DbLike, quotePositionId: string): Promise<void> => {
  await db.delete(quotePositionCharacteristics).where(eq(quotePositionCharacteristics.quotePositionId, quotePositionId))
}

/**
 * Rewrites sortOrder to match `orderedPositionIds`' order (index = new
 * sortOrder). Every update is scoped by `quoteId` too, so an id from
 * another quote in the list is simply a no-op, never a cross-quote write.
 */
export const reorderQuotePositions = async (
  db: DbLike,
  quoteId: string,
  orderedPositionIds: string[],
): Promise<void> => {
  await Promise.all(
    orderedPositionIds.map((positionId, index) =>
      db
        .update(quotePositions)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(and(eq(quotePositions.id, positionId), eq(quotePositions.quoteId, quoteId))),
    ),
  )
}
