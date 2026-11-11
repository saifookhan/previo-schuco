import {
  deleteQuotePosition as deleteQuotePositionQuery,
  deleteQuotePositionCharacteristics as deleteQuotePositionCharacteristicsQuery,
  getProductFamiliesPublishStatus,
  getProductFamilyById,
  getProductFamilyDetail,
  getQuotePositionFamilyId,
  getQuoteDetail as getQuoteDetailQuery,
  insertQuote,
  insertQuotePosition,
  insertQuotePositionCharacteristic,
  getIncomingShareDiscounts,
  isFamilySharedWith,
  isProductFamilyInLibrary,
  listQuotes,
  quoteExists,
  recalculateQuoteTotal,
  reorderQuotePositions as reorderQuotePositionsQuery,
  updateQuotePosition as updateQuotePositionQuery,
  type QuoteDetail,
  type QuoteSummary,
} from '@schuco/db'
import { computeCharacteristicPrice, computeLinePrice, type PricingMatrix } from '@schuco/calculation'
import { priceValidityStatus, priceValidityToday, type AuditLogListResponse, type RecordHistoryQuery } from '@schuco/contracts'

import { PG_UNIQUE_VIOLATION, pgErrorCode } from '../lib/pg-error'
import { withTenantDb, type TenantContext } from '../lib/tenant-db'
import { listAuditPage, recordAuditEvent, toHistoryEntry } from './audit-service'

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
  /** Overrides the auto-assigned "P01"/"P02"/... code (the reference app's "Add POS" naming dialog) — free text, must be unique within the quote. Omit/blank for the usual auto-numbered code. */
  positionCode?: string
}

const isPositiveFinite = (n: number): boolean => Number.isFinite(n) && n > 0
const isNonNegativeFinite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

/**
 * Resolves this position's code: `requestedCode` (trimmed) when the
 * caller named one (the reference app's "Add POS" dialog), otherwise the
 * usual auto-numbered "P01"/"P02"/... derived from the max of what's
 * actually there, not positions.length (a remove-then-add must not
 * reissue an already-used code — see the comment this replaced). A named
 * code must be unique within the quote; `excludePositionId` lets an edit
 * keep its own current code without tripping that check against itself.
 * @throws {QuoteValidationError} the requested code is already used by a different position in this quote
 */
/**
 * True for a Postgres unique_violation (error code 23505). `resolvePositionCode`'s
 * uniqueness check is only a read-then-check against this transaction's own
 * snapshot (default READ COMMITTED, no row lock) — two concurrent requests
 * choosing the same custom code could both pass it. The DB's own unique
 * index (`quote_positions_quote_id_position_code_idx`) is what actually
 * prevents the duplicate from committing; this just turns its violation
 * into the same QuoteValidationError the pre-check would have thrown,
 * instead of a raw 500.
 */
const isPositionCodeConflict = (error: unknown): boolean => pgErrorCode(error) === PG_UNIQUE_VIOLATION

const resolvePositionCode = (
  existingPositions: { id: string; positionCode: string }[],
  requestedCode: string | undefined,
  excludePositionId?: string,
): string => {
  const trimmed = requestedCode?.trim()
  if (trimmed) {
    const clash = existingPositions.some((p) => p.id !== excludePositionId && p.positionCode === trimmed)
    if (clash) {
      throw new QuoteValidationError(`Position code "${trimmed}" is already used by another position in this quote`)
    }
    return trimmed
  }
  const nextPositionNumber =
    existingPositions.reduce((max, p) => Math.max(max, Number(p.positionCode.replace(/\D/g, '')) || 0), 0) + 1
  return `P${String(nextPositionNumber).padStart(2, '0')}`
}

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
    /** The option's own discount/markup (v2); null = the position's applied. */
    discountPct: number | null
    markupPct: number | null
  }[]
}

/**
 * New quote positions may only use a family that is in the quoting company's library,
 * ready for invoicing, and whose prices are valid today (Italian time); positions
 * already on a quote keep theirs.
 * @throws {QuoteValidationError} the family is out of the company's library, isn't ready for invoicing, or its price validity hasn't started yet or has ended
 */
const assertUsableForNewPositions = async (
  tx: Parameters<typeof getProductFamilyDetail>[0],
  companyId: string,
  family: {
    id: string
    name: string
    readyForInvoicing: boolean
    priceValidFrom: string | null
    priceValidTo: string | null
  },
): Promise<void> => {
  if (!(await isProductFamilyInLibrary(tx, companyId, family.id))) {
    throw new QuoteValidationError(`"${family.name}" is not in your company's library`)
  }
  if (!family.readyForInvoicing) {
    throw new QuoteValidationError(`"${family.name}" is not ready for invoicing`)
  }
  const validity = priceValidityStatus(family, priceValidityToday())
  if (validity === 'upcoming') {
    throw new QuoteValidationError(`The prices of "${family.name}" are valid from ${family.priceValidFrom}`)
  }
  if (validity === 'expired') {
    throw new QuoteValidationError(`The prices of "${family.name}" expired on ${family.priceValidTo}`)
  }
}

/**
 * Resolves the chosen product line + each selected characteristic in the
 * caller's own product-family catalog and computes this position's price
 * at the given width/height/quantity, using the shared costing engine
 * (`@schuco/calculation`, the same code the catalog itself is priced
 * with). Shared by `addQuotePosition` and `updateQuotePosition` — pricing
 * is snapshotted into the row either way, never recomputed from the live
 * catalog on a later read.
 * Only a family in the company's library, ready for invoicing and with prices valid today can be used — except by
 * `keepFamilyId`: an existing position may be edited without switching away
 * from the (possibly expired) family it was priced from.
 * @throws {QuoteValidationError} bad input, the family/line/characteristic isn't visible to the caller, or the family is out of the company's library, isn't ready for invoicing, or its prices aren't valid today
 */
export const priceQuotePosition = async (
  ctx: TenantContext,
  tx: Parameters<typeof getProductFamilyDetail>[0],
  input: AddQuotePositionInput,
  { keepFamilyId }: { keepFamilyId?: string } = {},
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
  // A quote belongs to the supplier issuing it. It may be priced from that
  // company's own catalog, or from a PUBLISHED family that was shared with
  // the company, directly or through a chain (product_family_shares). A
  // family merely visible for another reason is not enough. No isSuperAdmin
  // exception: isSuperAdmin stays true while acting as another tenant via
  // X-Tenant-Id (ADR 0008), so a bypass here would let a super-admin acting
  // as company A attach an arbitrary company's family to a quote owned by A;
  // they must act as the supplier itself and pass this same check.
  const isUsableFamily =
    !!family &&
    (family.family.supplierCompanyId === ctx.effectiveCompanyId ||
      (family.family.isPublished && (await isFamilySharedWith(tx, family.family.id, ctx.effectiveCompanyId))))
  if (!family || !isUsableFamily) {
    throw new QuoteValidationError('Product family not found or not visible')
  }
  if (family.family.id !== keepFamilyId) {
    await assertUsableForNewPositions(tx, ctx.effectiveCompanyId, family.family)
  }
  const line = family.lines.find((l) => l.id === input.productLineId)
  if (!line) {
    throw new QuoteValidationError('Product line not found in this family')
  }

  const matrixById = new Map(family.matrices.map((m) => [m.id, m]))

  const selections = input.characteristicSelections.map((selection) => {
    const main = family.characteristics.find((c) => c.id === selection.characteristicId && !c.parentId)
    const sub = family.characteristics.find(
      (c) => c.id === selection.subCharacteristicId && c.parentId === selection.characteristicId,
    )
    if (!main || !sub) {
      throw new QuoteValidationError(
        `Characteristic selection ${selection.characteristicId}/${selection.subCharacteristicId} not found in this family`,
      )
    }
    return { selection, main, sub }
  })
  // The position's installation hours: the line's, plus what each chosen option adds (v2 options
  // have their own "Ore di posa"). An "Ore di posa x [€/h]" option is priced on these hours; the
  // line's own formula keeps the line's hours, so labour isn't charged on both.
  const installationHours =
    Number(line.installationHoursPerUnit) +
    selections.reduce((sum, { sub }) => sum + Number(sub.installationHoursPerUnit ?? 0), 0)

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
          minValue: line.minValue == null ? null : Number(line.minValue),
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

  // A family shared with this company at a non-zero discount starts positions at that discount;
  // otherwise (own family, or shared at 0%) the line's own catalog discount applies. Always overridable via input.
  const shareDiscount =
    family.family.supplierCompanyId === ctx.effectiveCompanyId
      ? 0
      : ((await getIncomingShareDiscounts(tx, ctx.effectiveCompanyId, [family.family.id])).get(family.family.id) ?? 0)
  const discountPct = input.discountPct ?? (shareDiscount > 0 ? shareDiscount : Number(line.discountPct))
  const extraMarkupPct = input.extraMarkupPct ?? Number(line.markupPct)
  if (discountPct < 0 || discountPct > 100) {
    throw new QuoteValidationError('discountPct must be between 0 and 100')
  }
  if (extraMarkupPct < 0 || extraMarkupPct > 10000) {
    throw new QuoteValidationError('extraMarkupPct must be between 0 and 10000')
  }
  const descriptionParts = [line.name]
  let characteristicsBasePrice = 0
  let characteristicsFinalPrice = 0
  const characteristicRows: {
    characteristicId: string
    subCharacteristicId: string
    characteristicName: string
    subCharacteristicName: string
    price: number
    pricingMode: 'auto' | 'manual'
    manualUnitPrice: number | null
    discountPct: number | null
    markupPct: number | null
  }[] = []

  for (const { selection, main, sub } of selections) {
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
              minValue: sub.minValue == null ? null : Number(sub.minValue),
              installationHoursPerUnit: installationHours,
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

    // A v2 option has its own discount and markup; on a shared family the position's discount (the
    // share's, or what the user typed over it) replaces the option's own.
    const ownDiscountPct = sub.discountPct == null ? null : shareDiscount > 0 ? discountPct : Number(sub.discountPct)
    const ownMarkupPct = sub.markupPct == null ? null : Number(sub.markupPct)
    characteristicsBasePrice += subPrice
    characteristicsFinalPrice += subPrice * (1 - (ownDiscountPct ?? discountPct) / 100) * ((ownMarkupPct ?? extraMarkupPct) / 100)
    characteristicRows.push({
      characteristicId: main.id,
      subCharacteristicId: sub.id,
      characteristicName: main.name,
      subCharacteristicName: sub.name,
      price: subPrice,
      pricingMode: subPricingMode,
      manualUnitPrice: subPricingMode === 'manual' ? (selection.manualUnitPrice as number) : null,
      discountPct: ownDiscountPct,
      markupPct: ownMarkupPct,
    })
    descriptionParts.push(`${main.name}: ${sub.name}`)
  }

  const totalM2 = (input.widthMm * input.heightMm * input.quantity) / 1_000_000
  const basePricePerUnit = lineBasePrice + characteristicsBasePrice
  const basePrice = basePricePerUnit * input.quantity
  // The line at the position's discount/markup, each option at its own (or the position's).
  const finalPrice =
    (lineBasePrice * (1 - discountPct / 100) * (extraMarkupPct / 100) + characteristicsFinalPrice) * input.quantity

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
  /** When previewing an edit: the position, so its own family stays usable (see `priceQuotePosition`). */
  editing?: { quoteId: string; positionId: string },
): Promise<QuotePositionPreview> =>
  withTenantDb(ctx, async (tx) => {
    const keepFamilyId = editing ? await getQuotePositionFamilyId(tx, editing.quoteId, editing.positionId) : null
    const priced = await priceQuotePosition(ctx, tx, input, { keepFamilyId: keepFamilyId ?? undefined })
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

    const positionCode = resolvePositionCode(existingQuote.positions, input.positionCode)
    // Derived from the max of what's actually there, not positions.length —
    // a remove-then-add must not reissue an already-used sortOrder.
    const nextSortOrder = existingQuote.positions.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1
    let positionId: string
    try {
      positionId = await insertQuotePosition(tx, {
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
    } catch (error) {
      if (isPositionCodeConflict(error)) {
        throw new QuoteValidationError(
          `Position code "${positionCode}" is already used by another position in this quote`,
        )
      }
      throw error
    }

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
        discountPct: row.discountPct == null ? null : String(row.discountPct),
        markupPct: row.markupPct == null ? null : String(row.markupPct),
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

    const priced = await priceQuotePosition(ctx, tx, input, { keepFamilyId: existingPosition.productFamilyId })
    // Blank/omitted positionCode means "leave it alone" here (unlike
    // addQuotePosition, where blank means "auto-assign the next one") —
    // an edit must never silently renumber a position the caller didn't
    // ask to rename. Only resolvePositionCode (uniqueness check) when an
    // actual rename was requested.
    const positionCode = input.positionCode?.trim()
      ? resolvePositionCode(existingQuote.positions, input.positionCode, positionId)
      : existingPosition.positionCode

    try {
      await updateQuotePositionQuery(tx, quoteId, positionId, {
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
      })
    } catch (error) {
      if (isPositionCodeConflict(error)) {
        throw new QuoteValidationError(
          `Position code "${positionCode}" is already used by another position in this quote`,
        )
      }
      throw error
    }

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
        discountPct: row.discountPct == null ? null : String(row.discountPct),
        markupPct: row.markupPct == null ? null : String(row.markupPct),
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
    const deleted = await deleteQuotePositionQuery(tx, quoteId, positionId)
    if (!deleted) {
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
        metadata: { positionId, positionCode: deleted.positionCode },
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
    // A duplicate is a new position, so the same rules as adding one apply.
    const sourceFamily = await getProductFamilyById(tx, source.productFamilyId)
    if (sourceFamily) {
      await assertUsableForNewPositions(tx, ctx.effectiveCompanyId, sourceFamily)
    }

    // Always auto-numbered, never the source's own code — a custom name is
    // unique to one position, copying it onto a duplicate would collide.
    const positionCode = resolvePositionCode(existingQuote.positions, undefined)
    const nextSortOrder = existingQuote.positions.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1

    let newPositionId: string
    try {
      newPositionId = await insertQuotePosition(tx, {
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
    } catch (error) {
      if (isPositionCodeConflict(error)) {
        throw new QuoteValidationError(
          `Position code "${positionCode}" is already used by another position in this quote`,
        )
      }
      throw error
    }
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
        discountPct: characteristic.discountPct,
        markupPct: characteristic.markupPct,
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

/**
 * A quote's change history (its audit entries), newest first — for anyone who
 * can see the quote. Returns null when the quote doesn't exist or isn't visible.
 * @throws {InvalidAuditCursorError} `query.cursor` was not produced by this API
 */
export const getQuoteHistory = (
  ctx: TenantContext,
  quoteId: string,
  query: RecordHistoryQuery,
): Promise<AuditLogListResponse | null> =>
  withTenantDb(ctx, async (tx) => {
    if (!(await quoteExists(tx, quoteId))) {
      return null
    }
    return listAuditPage(tx, { resourceType: 'quote', resourceId: quoteId }, query.cursor, query.limit, toHistoryEntry)
  })
