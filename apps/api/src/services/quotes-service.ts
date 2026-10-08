import {
  deleteQuotePosition as deleteQuotePositionQuery,
  deleteQuotePositionCharacteristics as deleteQuotePositionCharacteristicsQuery,
  getProductFamiliesPublishStatus,
  getProductFamilyDetail,
  getQuoteDetail as getQuoteDetailQuery,
  insertQuote,
  insertQuotePosition,
  insertQuotePositionCharacteristic,
  listQuotes,
  recalculateQuoteTotal,
  reorderQuotePositions as reorderQuotePositionsQuery,
  updateQuotePosition as updateQuotePositionQuery,
  type QuoteDetail,
  type QuoteSummary,
} from '@schuco/db'
import { computeCharacteristicPrice, computeLinePrice, type PricingMatrix } from '@schuco/calculation'

import { withTenantDb, type TenantContext } from '../lib/tenant-db'
import { recordAuditEvent } from './audit-service'

export interface QuoteActor {
  actorUserId: string
  actorCompanyId: string
  requestId?: string | null
}

/** The request references a product family/line/characteristic that doesn't exist or isn't visible to the caller, or the numbers don't make sense. */
export class QuoteValidationError extends Error {}

export type QuoteDetailWithValidity = {
  quote: QuoteDetail['quote']
  positions: (QuoteDetail['positions'][number] & { isValid: boolean })[]
}

/**
 * Loads a quote and flags each position `isValid: false` when its catalog
 * family is no longer published (e.g. the supplier unpublished it, or
 * published a newer version instead — see product-families-service's
 * `createNewVersionFromExcel`). Pricing/names stay exactly as snapshotted
 * either way; this is a display hint, not a pricing change. The family row
 * itself can never be gone (quote_positions.product_family_id is a RESTRICT
 * FK), so a batched publish-status lookup is all that's needed.
 */
const finalizeQuoteDetail = async (
  tx: Parameters<typeof getQuoteDetailQuery>[0],
  quoteId: string,
): Promise<QuoteDetailWithValidity | null> => {
  const detail = await getQuoteDetailQuery(tx, quoteId)
  if (!detail) {
    return null
  }
  const familyIds = [...new Set(detail.positions.map((p) => p.productFamilyId))]
  const publishStatus = await getProductFamiliesPublishStatus(tx, familyIds)
  return {
    quote: detail.quote,
    positions: detail.positions.map((position) => ({
      ...position,
      isValid: publishStatus.get(position.productFamilyId) ?? false,
    })),
  }
}

export interface CreateQuoteInput {
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

/** Creates an empty draft quote (no positions yet) owned by the caller's own company. */
export const createQuote = async (
  ctx: TenantContext,
  actor: QuoteActor,
  input: CreateQuoteInput,
): Promise<QuoteSummary> => {
  if (!input.reference.trim() || !input.customerName.trim()) {
    throw new QuoteValidationError('reference and customerName are required')
  }

  return withTenantDb(ctx, async (tx) => {
    // Insert from an explicit allowlist, never `...input` — `input` is the
    // raw request body (no Zod parse on this route), and spreading it
    // after supplierCompanyId/createdByUserId would let those (plus
    // status/totalPrice/id, none of which CreateQuoteInput even declares)
    // be overridden by whatever the caller sent. RLS would reject a
    // mismatched supplierCompanyId for a normal company-admin, but not for
    // a super-admin — this must be safe unconditionally, not "usually
    // caught by RLS".
    const quoteId = await insertQuote(tx, {
      supplierCompanyId: ctx.effectiveCompanyId,
      createdByUserId: actor.actorUserId,
      reference: input.reference,
      customerName: input.customerName,
      customerFiscalCode: input.customerFiscalCode,
      customerAddress: input.customerAddress,
      customerCity: input.customerCity,
      projectLocation: input.projectLocation,
      introText: input.introText,
      paymentTerms: input.paymentTerms,
      validityDays: input.validityDays,
    })
    await recordAuditEvent(
      tx,
      {
        actorType: 'user',
        actorUserId: actor.actorUserId,
        actorCompanyId: actor.actorCompanyId,
        requestId: actor.requestId,
      },
      ctx.effectiveCompanyId,
      {
        action: 'quote.create',
        resourceType: 'quote',
        resourceId: quoteId,
        metadata: { reference: input.reference },
      },
    )
    const detail = await getQuoteDetailQuery(tx, quoteId)
    return detail!.quote
  })
}

export const listMyQuotes = (ctx: TenantContext): Promise<QuoteSummary[]> =>
  withTenantDb(ctx, (tx) => listQuotes(tx, ctx.effectiveCompanyId))

export const getQuote = (ctx: TenantContext, quoteId: string): Promise<QuoteDetailWithValidity | null> =>
  withTenantDb(ctx, (tx) => finalizeQuoteDetail(tx, quoteId))

export interface AddQuotePositionInput {
  productFamilyId: string
  productLineId: string
  quantity: number
  widthMm: number
  heightMm: number
  /** {mainCharacteristicId, subCharacteristicId} — one per characteristic the caller is choosing a value for; a characteristic not listed here just isn't part of this position's price/description. Each selection has its own independent auto/manual pricing toggle (pricingMode), same shape as the position's own line pricing below. */
  characteristicSelections: {
    characteristicId: string
    subCharacteristicId: string
    pricingMode?: 'auto' | 'manual'
    manualUnitPrice?: number
  }[]
  /** Overrides the line's own catalog discount/markup as the position's starting point (still independently editable afterward). Omit to use the line's own values. */
  discountPct?: number
  extraMarkupPct?: number
  /** Overrides the auto-built description (line name + selected characteristic names). */
  description?: string
  /** 'manual' (the reference app's per-row "A"/"M" toggle) replaces the formula/matrix-computed line price with manualUnitPrice below. Defaults to 'auto'. */
  pricingMode?: 'auto' | 'manual'
  /** Required when pricingMode is 'manual' — the line's own €/unit price, typed in directly instead of computed. */
  manualUnitPrice?: number
}

const isPositiveFinite = (n: number): boolean => Number.isFinite(n) && n > 0
const isNonNegativeFinite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

const asMatrix = (widths: number[], heights: number[], matrix: (number | null)[][]): PricingMatrix => ({
  widths,
  heights,
  matrix,
})

/** Everything `addQuotePosition`/`updateQuotePosition` need to insert or update a priced position row — computed once by `priceQuotePosition` so neither one re-implements the pricing chain. */
interface PricedPosition {
  family: NonNullable<Awaited<ReturnType<typeof getProductFamilyDetail>>>
  line: NonNullable<Awaited<ReturnType<typeof getProductFamilyDetail>>>['lines'][number]
  linePricingMode: 'auto' | 'manual'
  lineManualUnitPrice: number | null
  /** The line's own €/unit contribution either way — `lineManualUnitPrice` in manual mode, the formula/matrix result in auto mode. Lets a caller show "here's what auto mode computed" even while manual is selected, instead of only exposing a value when it's actually in use. */
  lineUnitPrice: number
  description: string
  discountPct: number
  extraMarkupPct: number
  totalM2: number
  basePrice: number
  finalPrice: number
  characteristicRows: {
    characteristicId: string
    subCharacteristicId: string
    characteristicName: string
    subCharacteristicName: string
    price: number
    pricingMode: 'auto' | 'manual'
    manualUnitPrice: number | null
  }[]
}

/**
 * Resolves the chosen product line + each selected characteristic in the
 * caller's own product-family catalog and computes this position's price
 * at the given width/height/quantity, using the shared costing engine
 * (`@schuco/calculation`, the same code the catalog itself is priced
 * with). Shared by `addQuotePosition` and `updateQuotePosition` — pricing
 * is snapshotted into the row either way, never recomputed from the live
 * catalog on a later read.
 * @throws {QuoteValidationError} bad input, or the family/line/characteristic isn't visible to the caller
 */
export const priceQuotePosition = async (
  ctx: TenantContext,
  tx: Parameters<typeof getProductFamilyDetail>[0],
  input: AddQuotePositionInput,
): Promise<PricedPosition> => {
  if (!isPositiveFinite(input.quantity) || !Number.isInteger(input.quantity)) {
    throw new QuoteValidationError('quantity must be a positive whole number')
  }
  if (!isPositiveFinite(input.widthMm) || !isPositiveFinite(input.heightMm)) {
    throw new QuoteValidationError('widthMm and heightMm must be positive numbers')
  }
  if (!Array.isArray(input.characteristicSelections)) {
    throw new QuoteValidationError('characteristicSelections must be an array')
  }

  const family = await getProductFamilyDetail(tx, input.productFamilyId)
  // A quote belongs to the supplier issuing it — it must be priced from that
  // supplier's own catalog, never a family merely visible to them (e.g. a
  // supplier's own catalog published to a linked client: product_families_select
  // grants that client SELECT via app_can_view_product_family, which is far
  // broader than ownership; without this check that client could quote off
  // another company's catalog under its own quote). No isSuperAdmin exception:
  // isSuperAdmin stays true while acting as another tenant via X-Tenant-Id
  // (ADR 0008), so a bypass here would let a super-admin acting as company A
  // still attach company B's family to a quote owned by A. A super-admin
  // must set X-Tenant-Id to the supplier itself and pass this same check,
  // same as everyone else.
  if (!family || family.family.supplierCompanyId !== ctx.effectiveCompanyId) {
    throw new QuoteValidationError('Product family not found or not visible')
  }
  const line = family.lines.find((l) => l.id === input.productLineId)
  if (!line) {
    throw new QuoteValidationError('Product line not found in this family')
  }

  const matrixById = new Map(family.matrices.map((m) => [m.id, m]))

  const linePricingMode = input.pricingMode === 'manual' ? 'manual' : 'auto'
  let lineBasePrice: number
  if (linePricingMode === 'manual') {
    // Manual mode never reads the line's matrix/formula — a deleted/invalid
    // matrix on this line must not block a manual override that doesn't
    // need it at all (checked only in the 'auto' branch below).
    if (!isNonNegativeFinite(input.manualUnitPrice)) {
      throw new QuoteValidationError('manualUnitPrice must be a non-negative number when pricingMode is "manual"')
    }
    lineBasePrice = input.manualUnitPrice
  } else {
    const lineMatrix = line.pricingMatrixId ? matrixById.get(line.pricingMatrixId) : undefined
    if (line.pricingMatrixId && !lineMatrix) {
      throw new QuoteValidationError('Line references a pricing matrix that no longer exists')
    }
    try {
      lineBasePrice = computeLinePrice(
        {
          value: Number(line.value),
          formula: line.formula,
          pricingMatrix: lineMatrix ? asMatrix(lineMatrix.widths, lineMatrix.heights, lineMatrix.matrix) : null,
          installationHoursPerUnit: Number(line.installationHoursPerUnit),
          discountPct: 0,
          markupPct: 100,
        },
        input.widthMm,
        input.heightMm,
      ).basePrice
    } catch (error) {
      throw new QuoteValidationError(
        `Could not price this line at ${input.widthMm}x${input.heightMm}mm: ${(error as Error).message}`,
      )
    }
  }

  const descriptionParts = [line.name]
  let characteristicsBasePrice = 0
  const characteristicRows: {
    characteristicId: string
    subCharacteristicId: string
    characteristicName: string
    subCharacteristicName: string
    price: number
    pricingMode: 'auto' | 'manual'
    manualUnitPrice: number | null
  }[] = []

  for (const selection of input.characteristicSelections) {
    const main = family.characteristics.find((c) => c.id === selection.characteristicId && !c.parentId)
    const sub = family.characteristics.find(
      (c) => c.id === selection.subCharacteristicId && c.parentId === selection.characteristicId,
    )
    if (!main || !sub) {
      throw new QuoteValidationError(
        `Characteristic selection ${selection.characteristicId}/${selection.subCharacteristicId} not found in this family`,
      )
    }

    const subPricingMode = selection.pricingMode === 'manual' ? 'manual' : 'auto'
    let subPrice: number
    if (subPricingMode === 'manual') {
      if (!isNonNegativeFinite(selection.manualUnitPrice)) {
        throw new QuoteValidationError(
          `manualUnitPrice must be a non-negative number for "${main.name}: ${sub.name}" when its pricingMode is "manual"`,
        )
      }
      subPrice = selection.manualUnitPrice
    } else {
      const subMatrix = sub.pricingMatrixId ? matrixById.get(sub.pricingMatrixId) : undefined
      if (sub.pricingMatrixId && !subMatrix) {
        throw new QuoteValidationError('Selected option references a pricing matrix that no longer exists')
      }

      subPrice = 0
      // A characteristic sub-value with no formula/value and no matrix is a
      // free/included option (e.g. a default color) — costs nothing, same as
      // the reference workbook's blank-price rows.
      if (subMatrix || sub.formula) {
        try {
          const result = computeCharacteristicPrice(
            {
              value: sub.value == null ? 0 : Number(sub.value),
              formula: sub.formula ?? 'valore',
              pricingMatrix: subMatrix ? asMatrix(subMatrix.widths, subMatrix.heights, subMatrix.matrix) : null,
              installationHoursPerUnit: Number(line.installationHoursPerUnit),
              discountPct: 0,
              markupPct: 100,
            },
            input.widthMm,
            input.heightMm,
            lineBasePrice,
          )
          subPrice = result.basePrice
        } catch (error) {
          throw new QuoteValidationError(`Could not price "${main.name}: ${sub.name}": ${(error as Error).message}`)
        }
      }
    }

    characteristicsBasePrice += subPrice
    characteristicRows.push({
      characteristicId: main.id,
      subCharacteristicId: sub.id,
      characteristicName: main.name,
      subCharacteristicName: sub.name,
      price: subPrice,
      pricingMode: subPricingMode,
      manualUnitPrice: subPricingMode === 'manual' ? (selection.manualUnitPrice as number) : null,
    })
    descriptionParts.push(`${main.name}: ${sub.name}`)
  }

  const totalM2 = (input.widthMm * input.heightMm * input.quantity) / 1_000_000
  const basePricePerUnit = lineBasePrice + characteristicsBasePrice
  const basePrice = basePricePerUnit * input.quantity

  const discountPct = input.discountPct ?? Number(line.discountPct)
  const extraMarkupPct = input.extraMarkupPct ?? Number(line.markupPct)
  if (discountPct < 0 || discountPct > 100) {
    throw new QuoteValidationError('discountPct must be between 0 and 100')
  }
  if (extraMarkupPct < 0 || extraMarkupPct > 10000) {
    throw new QuoteValidationError('extraMarkupPct must be between 0 and 10000')
  }
  const finalPrice = basePrice * (1 - discountPct / 100) * (extraMarkupPct / 100)

  return {
    family,
    line,
    linePricingMode,
    lineManualUnitPrice: linePricingMode === 'manual' ? (input.manualUnitPrice as number) : null,
    lineUnitPrice: lineBasePrice,
    description: input.description?.trim() || descriptionParts.join(' — '),
    discountPct,
    extraMarkupPct,
    totalM2,
    basePrice,
    finalPrice,
    characteristicRows,
  }
}

export interface QuotePositionPreview {
  totalM2: number
  basePrice: number
  finalPrice: number
  discountPct: number
  extraMarkupPct: number
  /** The line's own €/unit price computed under whichever pricingMode the input asked for — lets the form show "here's what auto computed" in the disabled field, same number `addQuotePosition` would store. */
  lineUnitPrice: number
  /** Per-unit, pre-discount/markup — same basis `addQuotePosition` stores per characteristic row (each already reflects that selection's own pricingMode). */
  characteristics: { characteristicId: string; subCharacteristicId: string; price: number }[]
}

/**
 * Dry-run pricing — same computation as `addQuotePosition`/`updateQuotePosition`,
 * but writes nothing. Lets the quote builder show a live "estimated price"
 * as the sales user edits width/height/qty/characteristics/discount/manual
 * values, without creating or changing a real position on every keystroke.
 * @throws {QuoteValidationError} bad input, or the family/line/characteristic isn't visible to the caller
 */
export const previewQuotePosition = async (
  ctx: TenantContext,
  input: AddQuotePositionInput,
): Promise<QuotePositionPreview> =>
  withTenantDb(ctx, async (tx) => {
    const priced = await priceQuotePosition(ctx, tx, input)
    return {
      totalM2: priced.totalM2,
      basePrice: priced.basePrice,
      finalPrice: priced.finalPrice,
      discountPct: priced.discountPct,
      extraMarkupPct: priced.extraMarkupPct,
      lineUnitPrice: priced.lineUnitPrice,
      characteristics: priced.characteristicRows.map((r) => ({
        characteristicId: r.characteristicId,
        subCharacteristicId: r.subCharacteristicId,
        price: r.price,
      })),
    }
  })

/**
 * Adds one priced line item to a draft quote (see `priceQuotePosition`).
 * @throws {QuoteValidationError} bad input, or the family/line/characteristic isn't visible to the caller
 */
export const addQuotePosition = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  input: AddQuotePositionInput,
): Promise<QuoteDetailWithValidity> =>
  withTenantDb(ctx, async (tx) => {
    const existingQuote = await getQuoteDetailQuery(tx, quoteId)
    if (!existingQuote) {
      throw new QuoteValidationError('Quote not found')
    }

    const priced = await priceQuotePosition(ctx, tx, input)

    // Derived from the max of what's actually there, not positions.length — a
    // remove-then-add would otherwise reissue an already-used code/sortOrder
    // (e.g. P01,P02,P03 -> remove P02 -> next add becomes "P03" again).
    const nextPositionNumber =
      existingQuote.positions.reduce((max, p) => Math.max(max, Number(p.positionCode.replace(/\D/g, '')) || 0), 0) + 1
    const nextSortOrder = existingQuote.positions.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1
    const positionCode = `P${String(nextPositionNumber).padStart(2, '0')}`
    const positionId = await insertQuotePosition(tx, {
      quoteId,
      productFamilyId: input.productFamilyId,
      productLineId: input.productLineId,
      productFamilyName: priced.family.family.name,
      productLineName: priced.line.name,
      positionCode,
      quantity: input.quantity,
      widthMm: String(input.widthMm),
      heightMm: String(input.heightMm),
      description: priced.description,
      unitName: priced.line.unitName,
      unitSymbol: priced.line.unitSymbol,
      discountPct: String(priced.discountPct),
      extraMarkupPct: String(priced.extraMarkupPct),
      pricingMode: priced.linePricingMode,
      lineManualUnitPrice: priced.lineManualUnitPrice == null ? null : String(priced.lineManualUnitPrice),
      totalM2: priced.totalM2.toFixed(4),
      basePrice: priced.basePrice.toFixed(2),
      finalPrice: priced.finalPrice.toFixed(2),
      sortOrder: nextSortOrder,
    })

    for (const row of priced.characteristicRows) {
      await insertQuotePositionCharacteristic(tx, {
        quotePositionId: positionId,
        characteristicId: row.characteristicId,
        subCharacteristicId: row.subCharacteristicId,
        characteristicName: row.characteristicName,
        subCharacteristicName: row.subCharacteristicName,
        price: (row.price * input.quantity).toFixed(2),
        pricingMode: row.pricingMode,
        manualUnitPrice: row.manualUnitPrice == null ? null : String(row.manualUnitPrice),
      })
    }

    await recalculateQuoteTotal(tx, quoteId)
    await recordAuditEvent(
      tx,
      {
        actorType: 'user',
        actorUserId: actor.actorUserId,
        actorCompanyId: actor.actorCompanyId,
        requestId: actor.requestId,
      },
      ctx.effectiveCompanyId,
      {
        action: 'quote.add_position',
        resourceType: 'quote',
        resourceId: quoteId,
        metadata: { positionCode, productLineId: input.productLineId },
      },
    )

    const detail = await finalizeQuoteDetail(tx, quoteId)
    return detail!
  })

/**
 * Re-prices an existing position in place (same positionCode/sortOrder) —
 * lets a sales user go back and change size/characteristics/manual prices
 * after the fact, instead of having to delete and re-add (see
 * `priceQuotePosition`).
 * @throws {QuoteValidationError} bad input, position not found in this quote, or the family/line/characteristic isn't visible to the caller
 */
export const updateQuotePosition = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  positionId: string,
  input: AddQuotePositionInput,
): Promise<QuoteDetailWithValidity> =>
  withTenantDb(ctx, async (tx) => {
    const existingQuote = await getQuoteDetailQuery(tx, quoteId)
    if (!existingQuote) {
      throw new QuoteValidationError('Quote not found')
    }
    const existingPosition = existingQuote.positions.find((p) => p.id === positionId)
    if (!existingPosition) {
      throw new QuoteValidationError('Position not found in this quote')
    }

    const priced = await priceQuotePosition(ctx, tx, input)

    await updateQuotePositionQuery(tx, quoteId, positionId, {
      productFamilyId: input.productFamilyId,
      productLineId: input.productLineId,
      productFamilyName: priced.family.family.name,
      productLineName: priced.line.name,
      quantity: input.quantity,
      widthMm: String(input.widthMm),
      heightMm: String(input.heightMm),
      description: priced.description,
      unitName: priced.line.unitName,
      unitSymbol: priced.line.unitSymbol,
      discountPct: String(priced.discountPct),
      extraMarkupPct: String(priced.extraMarkupPct),
      pricingMode: priced.linePricingMode,
      lineManualUnitPrice: priced.lineManualUnitPrice == null ? null : String(priced.lineManualUnitPrice),
      totalM2: priced.totalM2.toFixed(4),
      basePrice: priced.basePrice.toFixed(2),
      finalPrice: priced.finalPrice.toFixed(2),
    })

    // Replace, not merge — simplest way to guarantee stale selections from
    // before this edit never linger (e.g. a characteristic the user
    // deselected must not still have a row here).
    await deleteQuotePositionCharacteristicsQuery(tx, positionId)
    for (const row of priced.characteristicRows) {
      await insertQuotePositionCharacteristic(tx, {
        quotePositionId: positionId,
        characteristicId: row.characteristicId,
        subCharacteristicId: row.subCharacteristicId,
        characteristicName: row.characteristicName,
        subCharacteristicName: row.subCharacteristicName,
        price: (row.price * input.quantity).toFixed(2),
        pricingMode: row.pricingMode,
        manualUnitPrice: row.manualUnitPrice == null ? null : String(row.manualUnitPrice),
      })
    }

    await recalculateQuoteTotal(tx, quoteId)
    await recordAuditEvent(
      tx,
      {
        actorType: 'user',
        actorUserId: actor.actorUserId,
        actorCompanyId: actor.actorCompanyId,
        requestId: actor.requestId,
      },
      ctx.effectiveCompanyId,
      {
        action: 'quote.update_position',
        resourceType: 'quote',
        resourceId: quoteId,
        metadata: {
          positionCode: existingPosition.positionCode,
          productLineId: input.productLineId,
        },
      },
    )

    const detail = await finalizeQuoteDetail(tx, quoteId)
    return detail!
  })

/** Removes a position from a quote and recalculates the quote's total. */
export const removeQuotePosition = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  positionId: string,
): Promise<QuoteDetailWithValidity> =>
  withTenantDb(ctx, async (tx) => {
    const owningQuoteId = await deleteQuotePositionQuery(tx, quoteId, positionId)
    if (!owningQuoteId) {
      throw new QuoteValidationError('Position not found in this quote')
    }
    await recalculateQuoteTotal(tx, quoteId)
    await recordAuditEvent(
      tx,
      {
        actorType: 'user',
        actorUserId: actor.actorUserId,
        actorCompanyId: actor.actorCompanyId,
        requestId: actor.requestId,
      },
      ctx.effectiveCompanyId,
      {
        action: 'quote.remove_position',
        resourceType: 'quote',
        resourceId: quoteId,
        metadata: { positionId },
      },
    )
    const detail = await finalizeQuoteDetail(tx, quoteId)
    return detail!
  })

/**
 * Reorders a quote's positions to match `positionIds` (must list every
 * current position id exactly once — partial/reshuffled subsets are
 * rejected rather than silently guessed at).
 */
export const reorderPositions = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  positionIds: string[],
): Promise<QuoteDetailWithValidity> =>
  withTenantDb(ctx, async (tx) => {
    if (!Array.isArray(positionIds) || positionIds.length === 0) {
      throw new QuoteValidationError('positionIds must be a non-empty array')
    }
    const existingQuote = await getQuoteDetailQuery(tx, quoteId)
    if (!existingQuote) {
      throw new QuoteValidationError('Quote not found')
    }
    const existingIds = new Set(existingQuote.positions.map((p) => p.id))
    const givenIds = new Set(positionIds)
    if (
      givenIds.size !== positionIds.length ||
      givenIds.size !== existingIds.size ||
      [...existingIds].some((id) => !givenIds.has(id))
    ) {
      throw new QuoteValidationError('positionIds must list every current position exactly once')
    }

    await reorderQuotePositionsQuery(tx, quoteId, positionIds)
    await recordAuditEvent(
      tx,
      {
        actorType: 'user',
        actorUserId: actor.actorUserId,
        actorCompanyId: actor.actorCompanyId,
        requestId: actor.requestId,
      },
      ctx.effectiveCompanyId,
      {
        action: 'quote.reorder_positions',
        resourceType: 'quote',
        resourceId: quoteId,
        metadata: {},
      },
    )
    const detail = await finalizeQuoteDetail(tx, quoteId)
    return detail!
  })

/** Duplicates one position (and its characteristic selections) as a new position appended to the end of the quote — a fast way to quote a near-identical size/config. */
export const duplicatePosition = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  positionId: string,
): Promise<QuoteDetailWithValidity> =>
  withTenantDb(ctx, async (tx) => {
    const existingQuote = await getQuoteDetailQuery(tx, quoteId)
    if (!existingQuote) {
      throw new QuoteValidationError('Quote not found')
    }
    const source = existingQuote.positions.find((p) => p.id === positionId)
    if (!source) {
      throw new QuoteValidationError('Position not found in this quote')
    }

    const nextPositionNumber =
      existingQuote.positions.reduce((max, p) => Math.max(max, Number(p.positionCode.replace(/\D/g, '')) || 0), 0) + 1
    const nextSortOrder = existingQuote.positions.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1
    const positionCode = `P${String(nextPositionNumber).padStart(2, '0')}`

    const newPositionId = await insertQuotePosition(tx, {
      quoteId,
      productFamilyId: source.productFamilyId,
      productLineId: source.productLineId,
      productFamilyName: source.productFamilyName,
      productLineName: source.productLineName,
      positionCode,
      quantity: source.quantity,
      widthMm: source.widthMm,
      heightMm: source.heightMm,
      description: source.description,
      unitName: source.unitName,
      unitSymbol: source.unitSymbol,
      discountPct: source.discountPct,
      extraMarkupPct: source.extraMarkupPct,
      pricingMode: source.pricingMode,
      lineManualUnitPrice: source.lineManualUnitPrice,
      totalM2: source.totalM2,
      basePrice: source.basePrice,
      finalPrice: source.finalPrice,
      sortOrder: nextSortOrder,
    })
    for (const characteristic of source.characteristics) {
      await insertQuotePositionCharacteristic(tx, {
        quotePositionId: newPositionId,
        characteristicId: characteristic.characteristicId,
        subCharacteristicId: characteristic.subCharacteristicId,
        characteristicName: characteristic.characteristicName,
        subCharacteristicName: characteristic.subCharacteristicName,
        price: characteristic.price,
        pricingMode: characteristic.pricingMode,
        manualUnitPrice: characteristic.manualUnitPrice,
      })
    }

    await recalculateQuoteTotal(tx, quoteId)
    await recordAuditEvent(
      tx,
      {
        actorType: 'user',
        actorUserId: actor.actorUserId,
        actorCompanyId: actor.actorCompanyId,
        requestId: actor.requestId,
      },
      ctx.effectiveCompanyId,
      {
        action: 'quote.duplicate_position',
        resourceType: 'quote',
        resourceId: quoteId,
        metadata: { sourcePositionId: positionId, positionCode },
      },
    )
    const detail = await finalizeQuoteDetail(tx, quoteId)
    return detail!
  })
