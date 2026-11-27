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

const NAME_MAX = 200
const DESCRIPTION_MAX = 4000
const UNIT_MAX = 100
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A line or option is priced by a formula plus a base value, or by a width × height table. */
export type ValidatedPriceMode =
  | { kind: 'formula'; formula: string; value: string }
  | { kind: 'matrix'; widths: number[]; heights: number[]; matrix: (number | null)[][] }

export interface ValidatedLinePatch {
  name?: string
  description?: string | null
  unitName?: string
  unitSymbol?: string
  formula?: string
  value?: string
  minValue?: string | null
  discountPct?: string | null
  markupPct?: string | null
  installationHoursPerUnit?: string | null
  /** When set, replaces formula/value (and the matrix link). A formula price clears the table. */
  price?: ValidatedPriceMode
  /** Main characteristic ids that apply to the line. Replaces the line's relations. */
  characteristicIds?: string[]
}

const requireText = (label: string, raw: unknown, max: number): string => {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return fail(`${label} is required`)
  }
  const value = raw.trim()
  if (value.length > max) {
    return fail(`${label} must be at most ${max} characters`)
  }
  return value
}

const optionalText = (label: string, raw: unknown, max: number): string | null => {
  if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return null
  }
  if (typeof raw !== 'string') {
    return fail(`${label} must be text`)
  }
  const value = raw.trim()
  if (value.length > max) {
    return fail(`${label} must be at most ${max} characters`)
  }
  return value
}

/** Formula plus value, or a price table. Ranges and formula syntax match the other pricing edits. */
export const validatePriceMode = (raw: unknown): ValidatedPriceMode => {
  if (typeof raw !== 'object' || raw === null) {
    return fail('price must be an object with kind "formula" or "matrix"')
  }
  const body = raw as Record<string, unknown>
  if (body.kind === 'formula') {
    return { kind: 'formula', formula: validateFormula(body.formula), value: numberField('value', body.value, 0, MAX_PRICE) }
  }
  if (body.kind === 'matrix') {
    const matrix = validateMatrixInput(body)
    return { kind: 'matrix', widths: matrix.widths, heights: matrix.heights, matrix: matrix.matrix }
  }
  return fail('price.kind must be "formula" or "matrix"')
}

const readCharacteristicIds = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) {
    return fail('characteristicIds must be a list of ids')
  }
  const ids = raw.map((id) => {
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
      return fail('characteristicIds must be UUIDs of this family\'s characteristics')
    }
    return id
  })
  return [...new Set(ids)]
}

/**
 * Validates a partial product-line edit. Only the provided fields are checked/returned.
 * `null` empties discount, markup, hours or the minimum, as an empty Excel cell does.
 * `price` switches between a formula and a price table; without it, formula and value
 * still edit the current formula price (the existing pricing form).
 */
export const validateLinePatch = (input: unknown): ValidatedLinePatch => {
  if (typeof input !== 'object' || input === null) {
    return fail('Request body must be an object')
  }
  const body = input as Record<string, unknown>
  const patch: ValidatedLinePatch = {}
  if (body.name !== undefined) patch.name = requireText('name', body.name, NAME_MAX)
  if (body.description !== undefined) patch.description = optionalText('description', body.description, DESCRIPTION_MAX)
  if (body.unitName !== undefined) patch.unitName = requireText('unitName', body.unitName, UNIT_MAX)
  if (body.unitSymbol !== undefined) patch.unitSymbol = requireText('unitSymbol', body.unitSymbol, UNIT_MAX)
  if (body.price !== undefined) patch.price = validatePriceMode(body.price)
  if (body.formula !== undefined && patch.price === undefined) patch.formula = validateFormula(body.formula)
  if (body.value !== undefined && patch.price === undefined) patch.value = numberField('value', body.value, 0, MAX_PRICE)
  const nullable = (key: string, min: number, max: number) => (body[key] === null ? null : numberField(key, body[key], min, max))
  if (body.minValue !== undefined) patch.minValue = nullable('minValue', 0, MAX_PRICE)
  if (body.discountPct !== undefined) patch.discountPct = nullable('discountPct', 0, 100)
  if (body.markupPct !== undefined) patch.markupPct = nullable('markupPct', 0, 10000)
  if (body.installationHoursPerUnit !== undefined) patch.installationHoursPerUnit = nullable('installationHoursPerUnit', 0, 1e6)
  if (body.characteristicIds !== undefined) patch.characteristicIds = readCharacteristicIds(body.characteristicIds)
  if (Object.keys(patch).length === 0) {
    return fail('No editable fields provided')
  }
  return patch
}

/** A new product line: name, both units, and a price. The other line fields are optional. */
export const validateCreateProductLine = (input: unknown): ValidatedLinePatch & { name: string; unitName: string; unitSymbol: string; price: ValidatedPriceMode } => {
  const patch = validateLinePatch(input)
  if (!patch.name) return fail('name is required')
  if (!patch.unitName) return fail('unitName is required')
  if (!patch.unitSymbol) return fail('unitSymbol is required')
  if (!patch.price) return fail('price is required')
  return patch as ValidatedLinePatch & { name: string; unitName: string; unitSymbol: string; price: ValidatedPriceMode }
}

export interface ValidatedCharacteristicPatch {
  name?: string
  formula?: string | null
  value?: string | null
  minValue?: string | null
  discountPct?: string | null
  markupPct?: string | null
  installationHoursPerUnit?: string | null
  price?: ValidatedPriceMode
}

const PRICING_PATCH_KEYS = ['formula', 'value', 'minValue', 'discountPct', 'markupPct', 'installationHoursPerUnit', 'price'] as const

/** True when the patch tries to set a price. Main characteristics have none. */
export const characteristicPatchHasPrice = (patch: ValidatedCharacteristicPatch): boolean =>
  PRICING_PATCH_KEYS.some((key) => patch[key] !== undefined)

/**
 * Validates a partial characteristic edit. A main characteristic accepts `name` only;
 * the service rejects a price on one. An option accepts the same economics as a line.
 * `null` clears a price field.
 */
export const validateCharacteristicPatch = (input: unknown): ValidatedCharacteristicPatch => {
  if (typeof input !== 'object' || input === null) {
    return fail('Request body must be an object')
  }
  const body = input as Record<string, unknown>
  const patch: ValidatedCharacteristicPatch = {}
  if (body.name !== undefined) patch.name = requireText('name', body.name, NAME_MAX)
  if (body.price !== undefined) patch.price = validatePriceMode(body.price)
  if (body.formula !== undefined && patch.price === undefined) patch.formula = body.formula === null ? null : validateFormula(body.formula)
  if (body.value !== undefined && patch.price === undefined) patch.value = body.value === null ? null : numberField('value', body.value, 0, MAX_PRICE)
  const nullable = (key: string, min: number, max: number) => (body[key] === null ? null : numberField(key, body[key], min, max))
  if (body.minValue !== undefined) patch.minValue = nullable('minValue', 0, MAX_PRICE)
  if (body.discountPct !== undefined) patch.discountPct = nullable('discountPct', 0, 100)
  if (body.markupPct !== undefined) patch.markupPct = nullable('markupPct', 0, 10000)
  if (body.installationHoursPerUnit !== undefined) patch.installationHoursPerUnit = nullable('installationHoursPerUnit', 0, 1e6)
  if (Object.keys(patch).length === 0) {
    return fail('No editable fields provided')
  }
  return patch
}

export type ValidatedCreateCharacteristic =
  | { kind: 'main'; name: string }
  | ({ kind: 'option'; parentId: string; name: string; price: ValidatedPriceMode } & ValidatedCharacteristicPatch)

const MAIN_PRICE_KEYS = ['formula', 'value', 'price', 'minValue', 'discountPct', 'markupPct', 'installationHoursPerUnit'] as const

/** A new main characteristic (`name` only) or a new option under `parentId` (name and price). */
export const validateCreateCharacteristic = (input: unknown): ValidatedCreateCharacteristic => {
  if (typeof input !== 'object' || input === null) {
    return fail('Request body must be an object')
  }
  const body = input as Record<string, unknown>
  const parentId = body.parentId
  if (parentId === undefined || parentId === null) {
    if (MAIN_PRICE_KEYS.some((key) => body[key] !== undefined)) {
      return fail('A characteristic has no price of its own — add an option under it')
    }
    return { kind: 'main', name: requireText('name', body.name, NAME_MAX) }
  }
  if (typeof parentId !== 'string' || !UUID_PATTERN.test(parentId)) {
    return fail('parentId must be the id of a characteristic in this family')
  }
  const patch = validateCharacteristicPatch(input)
  if (!patch.name) return fail('name is required')
  if (!patch.price) return fail('price is required')
  return { kind: 'option', parentId, ...patch, name: patch.name, price: patch.price }
}
