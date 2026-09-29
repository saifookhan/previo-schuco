import { evaluate } from 'mathjs'

/** A width×height price lookup table — `matrix[heightIndex][widthIndex]` is the price at that cell (`null` = no price defined for that cell). */
export interface PricingMatrix {
  widths: number[]
  heights: number[]
  matrix: (number | null)[][]
}

/**
 * Looks up a price from a `PricingMatrix` for a given width/height, using
 * nearest-match-at-or-above on each axis (the first table entry that's
 * `>=` the requested dimension) — matches the reference implementation's
 * `compute2DValue`. Both `widths` and `heights` must be sorted ascending.
 * @param matrixData - The lookup table
 * @param width - Requested width (same unit as `matrixData.widths`)
 * @param height - Requested height (same unit as `matrixData.heights`)
 * @returns The matched price, or null if width/height exceed every table entry
 */
export const lookupMatrixPrice = (
  matrixData: PricingMatrix,
  width: number,
  height: number,
): number | null => {
  const widthIndex = matrixData.widths.findIndex((w) => w >= width)
  const heightIndex = matrixData.heights.findIndex((h) => h >= height)

  if (widthIndex === -1 || heightIndex === -1) {
    return null
  }

  const row = matrixData.matrix[heightIndex]
  const value = row?.[widthIndex]
  return typeof value === 'number' && !Number.isNaN(value) ? value : null
}

export interface FormulaContext {
  /** Base value (Excel's "valore") — this line/characteristic's own configured value. */
  valore: number
  /** Width, same unit the formula author used (mm in the reference sheets). */
  B: number
  /** Height, same unit as B. */
  H: number
  /**
   * The already-computed base *product line* price — used only by the
   * "% sul valore base del prodotto" formula type. For the product line's
   * own price, this equals `valore` (there's no other base to reference
   * yet); for a characteristic layered on top of a line, this must be the
   * line's own already-computed final price, NOT the characteristic's
   * `valore` — getting this wrong silently miscalculates every
   * percentage-type characteristic (see `computeCharacteristicPrice`).
   */
  valore_base_in_vendita: number
  /** Installation hours per unit for the owning product line. */
  ore_di_posa: number
}

/**
 * Evaluates a product line or characteristic's pricing formula (a mathjs
 * expression resolved via `resolvePriceListType`, e.g.
 * `"(B/1000) * valore"`) against the given context.
 * @param formula - mathjs expression string
 * @param context - Variables the expression may reference
 * @throws if the formula is malformed or references an unknown variable — callers should catch and treat as a costing error, never let a bad formula silently produce 0
 */
export const evaluateFormula = (formula: string, context: FormulaContext): number => {
  const result = evaluate(formula, { ...context })
  if (typeof result !== 'number' || Number.isNaN(result)) {
    throw new Error(`Formula "${formula}" did not evaluate to a number`)
  }
  return result
}

export interface CostableLine {
  /** Fixed base value — used when pricingMatrix is absent. */
  value: number
  /** mathjs expression to compute this line's own price (from `resolvePriceListType`); ignored when pricingMatrix is set. */
  formula: string
  /** Present when this line's price comes from a width/height lookup table instead of `value`/`formula`. */
  pricingMatrix?: PricingMatrix | null
  installationHoursPerUnit: number
  discountPct: number
  markupPct: number
}

export interface CostResult {
  /** Price before discount/markup. */
  basePrice: number
  /** Price after discount and markup are applied. */
  finalPrice: number
}

/**
 * Computes a product LINE's own price for a given width/height: matrix
 * lookup when `pricingMatrix` is set, otherwise formula evaluation over
 * `value`. `valore_base_in_vendita` is set to the line's own `value`
 * here, since a product line has no other base price to reference — only
 * a characteristic layered on top of it does (see
 * `computeCharacteristicPrice`). Then applies discount/markup — same
 * order as the reference implementation (discount, then markup).
 * @param line - The product line
 * @param width - Requested width
 * @param height - Requested height
 * @throws if a matrix lookup falls outside the table, or the formula fails to evaluate
 */
export const computeLinePrice = (line: CostableLine, width: number, height: number): CostResult => {
  const basePrice = computeRawPrice(line, width, height, line.value)
  return applyDiscountAndMarkup(basePrice, line.discountPct, line.markupPct)
}

/**
 * Computes a CHARACTERISTIC's price layered on top of an already-priced
 * product line. The one thing this does that `computeLinePrice` can't:
 * passes the line's own already-computed price as `valore_base_in_vendita`
 * — required for the "% sul valore base del prodotto" formula type, which
 * means "a percentage of the product line's price," not of the
 * characteristic's own `value`.
 * @param characteristic - The characteristic (same shape as a line for costing purposes)
 * @param width - Requested width
 * @param height - Requested height
 * @param lineBasePrice - The owning product line's already-computed price (its `basePrice`, pre-discount/markup — matches the reference implementation's `computedOutput`)
 * @throws if a matrix lookup falls outside the table, or the formula fails to evaluate
 */
export const computeCharacteristicPrice = (
  characteristic: CostableLine,
  width: number,
  height: number,
  lineBasePrice: number,
): CostResult => {
  const basePrice = computeRawPrice(characteristic, width, height, lineBasePrice)
  return applyDiscountAndMarkup(basePrice, characteristic.discountPct, characteristic.markupPct)
}

const computeRawPrice = (
  line: CostableLine,
  width: number,
  height: number,
  valoreBaseInVendita: number,
): number => {
  if (line.pricingMatrix) {
    const matched = lookupMatrixPrice(line.pricingMatrix, width, height)
    if (matched === null) {
      throw new Error('No matrix price found for the given width/height')
    }
    return matched
  }

  return evaluateFormula(line.formula, {
    valore: line.value,
    B: width,
    H: height,
    valore_base_in_vendita: valoreBaseInVendita,
    ore_di_posa: line.installationHoursPerUnit,
  })
}

const applyDiscountAndMarkup = (basePrice: number, discountPct: number, markupPct: number): CostResult => {
  const afterDiscount = basePrice * (1 - discountPct / 100)
  const finalPrice = afterDiscount * (markupPct / 100)
  return { basePrice, finalPrice }
}
