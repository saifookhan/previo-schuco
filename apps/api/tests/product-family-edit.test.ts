import { afterEach, describe, expect, it } from 'vitest'

import {
  ProductFamilyValidationError,
  getProductFamilyEditPolicy,
  isProductFamilyEditable,
  validateCharacteristicPatch,
  validateCreateCharacteristic,
  validateCreateProductLine,
  validateFormula,
  validateLinePatch,
  validateMatrixInput,
} from '../src/lib/product-family-edit'

/** Pure unit tests (ADR 0012, no DB) for the pricing-edit validators and the edit-policy switch. */

describe('validateMatrixInput', () => {
  const ok = { widths: [800, 1000], heights: [800, 1000], matrix: [[533, 555], [null, 561]] }

  it('accepts a well-formed grid, including empty (null) cells', () => {
    expect(validateMatrixInput(ok)).toEqual(ok)
  })

  it('rejects axes that are not strictly ascending (lookup relies on order)', () => {
    expect(() => validateMatrixInput({ ...ok, widths: [1000, 800] })).toThrow(ProductFamilyValidationError)
    expect(() => validateMatrixInput({ ...ok, heights: [800, 800] })).toThrow(/strictly ascending/)
  })

  it('rejects a grid whose shape does not match the axes', () => {
    expect(() => validateMatrixInput({ ...ok, matrix: [[1, 2]] })).toThrow(/2 rows/)
    expect(() => validateMatrixInput({ ...ok, matrix: [[1, 2], [3]] })).toThrow(/row 2/)
  })

  it('rejects negative, non-numeric and non-finite cells', () => {
    expect(() => validateMatrixInput({ ...ok, matrix: [[-1, 2], [3, 4]] })).toThrow(ProductFamilyValidationError)
    expect(() => validateMatrixInput({ ...ok, matrix: [['x', 2], [3, 4]] })).toThrow(ProductFamilyValidationError)
    expect(() => validateMatrixInput({ ...ok, matrix: [[Infinity, 2], [3, 4]] })).toThrow(ProductFamilyValidationError)
  })

  it('rejects a missing/non-object body', () => {
    expect(() => validateMatrixInput(null)).toThrow(ProductFamilyValidationError)
    expect(() => validateMatrixInput({ widths: [], heights: [1], matrix: [] })).toThrow(ProductFamilyValidationError)
  })
})

describe('validateFormula', () => {
  it('accepts every formula shape the Excel import produces', () => {
    for (const f of [
      'valore',
      '((B+H)*2/1000) * valore',
      '(B/1000) * valore',
      '((B*H)/1000000) * valore',
      'ore_di_posa * valore',
      'valore_base_in_vendita * valore / 100',
    ]) {
      expect(validateFormula(f)).toBe(f)
    }
  })

  it('accepts the allowed math functions', () => {
    expect(validateFormula('max(valore, 10) * ceil(B / 1000)')).toBeTruthy()
  })

  it('rejects unknown names, so a typo fails now instead of at costing time', () => {
    expect(() => validateFormula('valor * 2')).toThrow(/unknown name "valor"/)
  })

  it('rejects anything that is not plain arithmetic (no expression-language escape hatches)', () => {
    expect(() => validateFormula('import("fs")')).toThrow(ProductFamilyValidationError)
    expect(() => validateFormula('valore; 1')).toThrow(/unsupported characters/)
    expect(() => validateFormula('evaluate(1)')).toThrow(/unknown name/)
  })

  it('rejects malformed expressions and empty/oversized input', () => {
    expect(() => validateFormula('valore +')).toThrow(/valid expression/)
    expect(() => validateFormula('')).toThrow(ProductFamilyValidationError)
    expect(() => validateFormula('1+'.repeat(150) + '1')).toThrow(ProductFamilyValidationError)
  })
})

describe('validateLinePatch / validateCharacteristicPatch', () => {
  it('returns only the provided fields, normalised to strings for numeric columns', () => {
    expect(validateLinePatch({ value: 12.5, discountPct: '43', formula: 'valore * 2' })).toEqual({
      value: '12.5',
      discountPct: '43',
      formula: 'valore * 2',
    })
  })

  it("empties a line's discount, markup or hours with null, but not its value", () => {
    expect(validateLinePatch({ discountPct: null, markupPct: null, installationHoursPerUnit: null })).toEqual({
      discountPct: null,
      markupPct: null,
      installationHoursPerUnit: null,
    })
    expect(() => validateLinePatch({ value: null })).toThrow(/value/)
  })

  it('enforces per-field ranges', () => {
    expect(() => validateLinePatch({ discountPct: 101 })).toThrow(/discountPct/)
    expect(() => validateLinePatch({ markupPct: -1 })).toThrow(/markupPct/)
    expect(() => validateLinePatch({ value: 'abc' })).toThrow(/value/)
  })

  it('rejects an empty patch', () => {
    expect(() => validateLinePatch({})).toThrow(/No editable fields/)
    expect(() => validateCharacteristicPatch({})).toThrow(/No editable fields/)
  })

  it('lets a characteristic clear a field with null (e.g. when it prices via a matrix)', () => {
    expect(validateCharacteristicPatch({ value: null, formula: null })).toEqual({ value: null, formula: null })
  })

  it('accepts a line name, units, minimum and a price mode, and ignores formula when price is set', () => {
    expect(
      validateLinePatch({
        name: ' Frame ',
        unitName: 'Piece',
        unitSymbol: 'Pz',
        minValue: null,
        price: { kind: 'formula', formula: 'valore', value: 4 },
        formula: 'not used',
      }),
    ).toEqual({
      name: 'Frame',
      unitName: 'Piece',
      unitSymbol: 'Pz',
      minValue: null,
      price: { kind: 'formula', formula: 'valore', value: '4' },
    })
  })

  it('requires name, units and a price when creating a line', () => {
    expect(() => validateCreateProductLine({ name: 'Frame' })).toThrow(/unitName/)
    expect(
      validateCreateProductLine({
        name: 'Frame',
        unitName: 'Piece',
        unitSymbol: 'Pz',
        price: { kind: 'matrix', widths: [800], heights: [900], matrix: [[1]] },
      }).price,
    ).toEqual({ kind: 'matrix', widths: [800], heights: [900], matrix: [[1]] })
  })

  it('accepts option economics and rejects a price on a new main characteristic', () => {
    expect(validateCharacteristicPatch({ name: 'Glass', discountPct: 10, installationHoursPerUnit: null })).toEqual({
      name: 'Glass',
      discountPct: '10',
      installationHoursPerUnit: null,
    })
    expect(validateCreateCharacteristic({ name: 'Glass' })).toEqual({ kind: 'main', name: 'Glass' })
    expect(() => validateCreateCharacteristic({ name: 'Glass', value: 1 })).toThrow(/no price of its own/)
    const option = validateCreateCharacteristic({
      parentId: '11111111-1111-4111-8111-111111111111',
      name: 'Clear',
      price: { kind: 'formula', formula: 'valore', value: 2 },
    })
    expect(option).toMatchObject({ kind: 'option', name: 'Clear' })
    expect(() => validateCreateCharacteristic({ parentId: 'not-a-uuid', name: 'Clear' })).toThrow(/parentId/)
  })
})

describe('edit policy switch', () => {
  const original = process.env.PRODUCT_FAMILY_EDIT_POLICY
  afterEach(() => {
    if (original === undefined) delete process.env.PRODUCT_FAMILY_EDIT_POLICY
    else process.env.PRODUCT_FAMILY_EDIT_POLICY = original
  })

  it('defaults to "any": published families are editable', () => {
    delete process.env.PRODUCT_FAMILY_EDIT_POLICY
    expect(getProductFamilyEditPolicy()).toBe('any')
    expect(isProductFamilyEditable({ isPublished: true })).toBe(true)
  })

  it('"draft-only" locks published families but not drafts', () => {
    process.env.PRODUCT_FAMILY_EDIT_POLICY = 'draft-only'
    expect(isProductFamilyEditable({ isPublished: true })).toBe(false)
    expect(isProductFamilyEditable({ isPublished: false })).toBe(true)
  })

  it('treats an unrecognised value as the safe default rather than silently locking', () => {
    process.env.PRODUCT_FAMILY_EDIT_POLICY = 'nonsense'
    expect(getProductFamilyEditPolicy()).toBe('any')
  })
})
