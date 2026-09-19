import { describe, expect, it } from 'vitest'

import {
  computeCharacteristicPrice,
  computeLinePrice,
  evaluateFormula,
  lookupMatrixPrice,
  type PricingMatrix,
} from '../src/product-costing'

/**
 * Pure unit tests (ADR 0012, category "unit" — no DB). The matrix/values
 * here are lifted directly from a real supplier workbook
 * (`apps/api/tests/fixtures/product-family-sample.xlsx`, sheet "LP1")
 * and the exact numbers verified manually against it before this test
 * existed — not invented.
 */
const lp1Matrix: PricingMatrix = {
  widths: [0, 800, 1000, 1200, 1400],
  heights: [0, 800, 1000, 1200, 1400],
  matrix: [
    [NaN, NaN, NaN, NaN, NaN],
    [NaN, 533, 555, 577, 606],
    [NaN, 538, 561, 585, 615],
    [NaN, 543, 568, 593, 623],
    [NaN, 549, 574, 600, 633],
  ],
}

describe('lookupMatrixPrice', () => {
  it('matches the nearest width/height at-or-above the requested dimensions', () => {
    expect(lookupMatrixPrice(lp1Matrix, 1000, 800)).toBe(555)
    expect(lookupMatrixPrice(lp1Matrix, 900, 800)).toBe(555) // 900 -> rounds up to the 1000 column
    expect(lookupMatrixPrice(lp1Matrix, 1200, 1400)).toBe(600)
  })

  it('returns null when a dimension exceeds every table entry', () => {
    expect(lookupMatrixPrice(lp1Matrix, 5000, 800)).toBeNull()
    expect(lookupMatrixPrice(lp1Matrix, 800, 5000)).toBeNull()
  })

  it('returns null for a matched cell that is NaN (an "ERROR"/"ERRORE" cell in the source sheet)', () => {
    expect(lookupMatrixPrice(lp1Matrix, 0, 800)).toBeNull()
  })
})

describe('evaluateFormula', () => {
  it('evaluates a mathjs expression against the given context', () => {
    const result = evaluateFormula('(B/1000) * valore', {
      valore: 10,
      B: 2000,
      H: 0,
      valore_base_in_vendita: 10,
      ore_di_posa: 0,
    })
    expect(result).toBe(20)
  })

  it('throws on a malformed formula rather than silently returning 0', () => {
    expect(() =>
      evaluateFormula('valore +', {
        valore: 1,
        B: 0,
        H: 0,
        valore_base_in_vendita: 1,
        ore_di_posa: 0,
      }),
    ).toThrow()
  })
})

describe('computeLinePrice', () => {
  it('matrix-based line: looks up the price, then applies discount and markup', () => {
    // Real numbers from the fixture: "N95 L motorizzata" line, discount
    // 43% (raw 0.43), markup 150% (raw 1.5), LP1 matrix at width=1000/height=800 -> 555.
    const result = computeLinePrice(
      { value: 0, formula: 'valore', pricingMatrix: lp1Matrix, installationHoursPerUnit: 0, discountPct: 43, markupPct: 150 },
      1000,
      800,
    )
    expect(result.basePrice).toBe(555)
    expect(result.finalPrice).toBeCloseTo(555 * (1 - 43 / 100) * (150 / 100), 6)
  })

  it('formula-based line: evaluates the formula against its own value, applies discount/markup', () => {
    // Real numbers from the fixture: "Guida aggintiva" line — value 10,
    // formula "(B*2/1000) * valore" (Tipo_Listino "2xAltezza x [€/m]"),
    // discount 43%, markup 150%.
    const result = computeLinePrice(
      {
        value: 10,
        formula: '(B*2/1000) * valore',
        pricingMatrix: null,
        installationHoursPerUnit: 1,
        discountPct: 43,
        markupPct: 150,
      },
      2000,
      0,
    )
    const expectedBase = (2000 * 2 / 1000) * 10
    expect(result.basePrice).toBe(expectedBase)
    expect(result.finalPrice).toBeCloseTo(expectedBase * (1 - 43 / 100) * (150 / 100), 6)
  })

  it('throws when a matrix lookup falls outside the table, rather than returning a wrong price', () => {
    expect(() =>
      computeLinePrice(
        { value: 0, formula: 'valore', pricingMatrix: lp1Matrix, installationHoursPerUnit: 0, discountPct: 0, markupPct: 100 },
        99999,
        99999,
      ),
    ).toThrow()
  })
})

describe('computeCharacteristicPrice', () => {
  it('"% sul valore base del prodotto" formula references the LINE\'s price, not the characteristic\'s own value', () => {
    // Real type from the fixture's "Elenchi" sheet:
    // valore_base_in_vendita * valore / 100. A characteristic with
    // value=10 (10%) layered on a line whose own price came out to 500
    // must cost 50, not 10% of its own `value` (which would be nonsensical).
    const result = computeCharacteristicPrice(
      {
        value: 10,
        formula: 'valore_base_in_vendita * valore / 100',
        pricingMatrix: null,
        installationHoursPerUnit: 0,
        discountPct: 0,
        markupPct: 100,
      },
      0,
      0,
      500, // the owning line's already-computed base price
    )
    expect(result.basePrice).toBe(50)
  })

  it('a matrix-based characteristic ignores lineBasePrice entirely (matrix lookup doesn\'t reference it)', () => {
    const result = computeCharacteristicPrice(
      { value: 0, formula: 'valore', pricingMatrix: lp1Matrix, installationHoursPerUnit: 0, discountPct: 0, markupPct: 100 },
      1000,
      800,
      999999,
    )
    expect(result.basePrice).toBe(555)
  })
})
