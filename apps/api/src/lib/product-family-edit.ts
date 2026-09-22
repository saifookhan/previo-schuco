import { evaluateFormula } from '@schuco/calculation'

/**
 * Who may edit a product family's pricing data (matrices, line/characteristic
 * values, formulas, discount/markup).
 * - `any` (default): supplier admins may edit any of their families, published or not.
 * - `draft-only`: published families are locked; unpublish (or create a new
 *   version) first. Flip via `PRODUCT_FAMILY_EDIT_POLICY=draft-only`, no code change.
 */
export type ProductFamilyEditPolicy = 'any' | 'draft-only'

export const getProductFamilyEditPolicy = (): ProductFamilyEditPolicy =>
  process.env.PRODUCT_FAMILY_EDIT_POLICY === 'draft-only' ? 'draft-only' : 'any'

export const isProductFamilyEditable = (family: { isPublished: boolean }): boolean =>
  getProductFamilyEditPolicy() === 'any' || !family.isPublished

/** The submitted edit is malformed or out of range — nothing was written. */
export class ProductFamilyValidationError extends Error {}

/** The family is locked for editing by the current edit policy (see `ProductFamilyEditPolicy`). */
export class ProductFamilyLockedError extends Error {
  constructor() {
    super('This product family is published and locked for editing')
  }
}

export class ProductFamilyNotFoundError extends Error {
  constructor(message = 'Product family not found') {
    super(message)
  }
}

const MAX_AXIS_LENGTH = 200
const MAX_PRICE = 1e9

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const fail = (message: string): never => {
  throw new ProductFamilyValidationError(message)
}

const validateAxis = (label: string, value: unknown): number[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_AXIS_LENGTH) {
    return fail(`${label} must be a non-empty list of at most ${MAX_AXIS_LENGTH} numbers`)
  }
  const axis = value as unknown[]
  axis.forEach((v, i) => {
    if (!isFiniteNumber(v) || v < 0 || v > MAX_PRICE) {
      fail(`${label}[${i}] must be a number between 0 and ${MAX_PRICE}`)
    }
    if (i > 0 && (v as number) <= (axis[i - 1] as number)) {
      fail(`${label} must be strictly ascending (problem at position ${i + 1})`)
    }
  })
  return axis as number[]
}

export interface ValidatedMatrix {
  widths: number[]
  heights: number[]
  matrix: (number | null)[][]
}

/**
 * Validates a pricing-matrix edit: strictly-ascending axes (lookup relies
 * on it — `lookupMatrixPrice` takes the first entry `>=` the request),
 * a `heights × widths` grid, and each cell a non-negative number or `null`
 * ("no price for this size").
 */
export const validateMatrixInput = (input: unknown): ValidatedMatrix => {
  if (typeof input !== 'object' || input === null) {
    return fail('Request body must be an object with widths, heights and matrix')
  }
  const { widths: rawWidths, heights: rawHeights, matrix: rawMatrix } = input as Record<string, unknown>
  const widths = validateAxis('widths', rawWidths)
  const heights = validateAxis('heights', rawHeights)

  if (!Array.isArray(rawMatrix) || rawMatrix.length !== heights.length) {
    return fail(`matrix must have exactly ${heights.length} rows (one per height)`)
  }
  const matrix = (rawMatrix as unknown[]).map((row, r) => {
    if (!Array.isArray(row) || row.length !== widths.length) {
      return fail(`matrix row ${r + 1} must have exactly ${widths.length} cells (one per width)`)
    }
    return (row as unknown[]).map((cell, c) => {
      if (cell === null) {
        return null
      }
      if (!isFiniteNumber(cell) || cell < 0 || cell > MAX_PRICE) {
        return fail(`matrix cell (row ${r + 1}, column ${c + 1}) must be a number between 0 and ${MAX_PRICE}, or empty`)
      }
      return cell
    })
  })
  return { widths, heights, matrix }
}

const FORMULA_VARIABLES = ['valore', 'B', 'H', 'valore_base_in_vendita', 'ore_di_posa']
const FORMULA_FUNCTIONS = ['min', 'max', 'round', 'ceil', 'floor', 'abs', 'sqrt', 'pow']

/**
 * Validates a pricing formula (mathjs expression). Because suppliers type
 * these, the accepted surface is deliberately small: plain arithmetic
 * characters, only the known variables, and a handful of math functions —
 * then it's test-evaluated so a formula that would throw or return a
 * non-number at costing time is rejected here instead.
 */
export const validateFormula = (raw: unknown): string => {
  if (typeof raw !== 'string' || raw.trim() === '' || raw.length > 200) {
    return fail('formula must be a non-empty string of at most 200 characters')
  }
  const formula = raw.trim()
  if (!/^[0-9A-Za-z_+\-*/().,%^\s]+$/.test(formula)) {
    return fail('formula contains unsupported characters')
  }
  const identifiers = formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
  const unknown = identifiers.find((id) => !FORMULA_VARIABLES.includes(id) && !FORMULA_FUNCTIONS.includes(id))
  if (unknown) {
    return fail(
      `formula uses unknown name "${unknown}" — allowed: ${[...FORMULA_VARIABLES, ...FORMULA_FUNCTIONS].join(', ')}`,
    )
  }
  try {
    evaluateFormula(formula, { valore: 1, B: 1000, H: 1000, valore_base_in_vendita: 1, ore_di_posa: 1 })
  } catch {
    return fail('formula is not a valid expression that evaluates to a number')
  }
  return formula
}

const numberField = (label: string, raw: unknown, min: number, max: number): string => {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
  if (!isFiniteNumber(n) || n < min || n > max) {
    return fail(`${label} must be a number between ${min} and ${max}`)
  }
  return String(n)
}

export interface ValidatedLinePatch {
  formula?: string
  value?: string
  discountPct?: string
  markupPct?: string
  installationHoursPerUnit?: string
}

/** Validates a partial product-line pricing edit; only the provided fields are checked/returned. */
export const validateLinePatch = (input: unknown): ValidatedLinePatch => {
  if (typeof input !== 'object' || input === null) {
    return fail('Request body must be an object')
  }
  const body = input as Record<string, unknown>
  const patch: ValidatedLinePatch = {}
  if (body.formula !== undefined) patch.formula = validateFormula(body.formula)
  if (body.value !== undefined) patch.value = numberField('value', body.value, 0, MAX_PRICE)
  if (body.discountPct !== undefined) patch.discountPct = numberField('discountPct', body.discountPct, 0, 100)
  if (body.markupPct !== undefined) patch.markupPct = numberField('markupPct', body.markupPct, 0, 10000)
  if (body.installationHoursPerUnit !== undefined) {
    patch.installationHoursPerUnit = numberField('installationHoursPerUnit', body.installationHoursPerUnit, 0, 1e6)
  }
  if (Object.keys(patch).length === 0) {
    return fail('No editable fields provided')
  }
  return patch
}

export interface ValidatedCharacteristicPatch {
  formula?: string | null
  value?: string | null
}

/** Validates a partial sub-characteristic pricing edit (`null` clears the field, e.g. when it prices via a matrix instead). */
export const validateCharacteristicPatch = (input: unknown): ValidatedCharacteristicPatch => {
  if (typeof input !== 'object' || input === null) {
    return fail('Request body must be an object')
  }
  const body = input as Record<string, unknown>
  const patch: ValidatedCharacteristicPatch = {}
  if (body.formula !== undefined) patch.formula = body.formula === null ? null : validateFormula(body.formula)
  if (body.value !== undefined) patch.value = body.value === null ? null : numberField('value', body.value, 0, MAX_PRICE)
  if (Object.keys(patch).length === 0) {
    return fail('No editable fields provided')
  }
  return patch
}
