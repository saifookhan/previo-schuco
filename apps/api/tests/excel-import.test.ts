import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { extract2DArray } from '../src/lib/excel-import/extract-2d-array'
import { extractEmbeddedImages } from '../src/lib/excel-import/extract-embedded-images'
import { parseProductFamilyWorkbook } from '../src/lib/excel-import'
import { PRICE_LIST_TYPE_FORMULAS, resolvePriceListType } from '../src/lib/excel-import/price-list-types'

/**
 * Unit tests (ADR 0012, category "unit" — no DB) against a real supplier
 * workbook (`tests/fixtures/product-family-sample.xlsx`), not a
 * synthetic one — every number asserted here was checked against the
 * actual file before this test existed, not invented to make the test
 * pass.
 */
const fixturePath = join(__dirname, 'fixtures/product-family-sample.xlsx')
const fixtureBuffer = readFileSync(fixturePath)

describe('resolvePriceListType', () => {
  it('resolves every known Tipo_Listino to its formula (verified against the fixture\'s own "Elenchi" sheet)', () => {
    expect(resolvePriceListType('Valore_Fisso [€/Pz]')).toEqual({ kind: 'formula', formula: 'valore' })
    expect(resolvePriceListType('2xAltezza x [€/m]')).toEqual({
      kind: 'formula',
      formula: '(B*2/1000) * valore',
    })
    expect(resolvePriceListType('Tabella BxH [€/Pz]')).toEqual({ kind: 'matrix' })
  })

  it('throws on an unrecognized type instead of guessing a formula', () => {
    expect(() => resolvePriceListType('Some Made Up Type [€/x]')).toThrow(/Unknown Tipo_Listino/)
  })

  it('has an entry for every type this fixture actually uses', () => {
    const usedTypes = ['Valore_Fisso [€/Pz]', 'Tabella BxH [€/Pz]', '2xAltezza x [€/m]', '% sul valore base del prodotto']
    for (const type of usedTypes) {
      expect(PRICE_LIST_TYPE_FORMULAS).toHaveProperty(type)
    }
  })
})

describe('extract2DArray', () => {
  it('parses a matrix sheet layout (row 0 = widths, col 0 = heights) and converts "ERROR" cells to NaN', () => {
    const rows = [
      ['DIMENSIONS', 0, 800, 1000],
      [0, 'ERROR', 'ERROR', 'ERROR'],
      [800, 'ERROR', 533, 555],
    ]
    const result = extract2DArray(rows)
    expect(result.widths).toEqual([0, 800, 1000])
    expect(result.heights).toEqual([0, 800])
    expect(result.matrix[1]).toEqual([NaN, 533, 555])
  })
})

describe('parseProductFamilyWorkbook (real fixture)', () => {
  const parsed = parseProductFamilyWorkbook(fixtureBuffer)

  it('parses the family header from the Label/Value "Product Family" sheet', () => {
    expect(parsed.family.family_name).toBe('Tenda tecnica NEST')
    expect(parsed.family.technical_name).toBe('NEST')
    expect(parsed.family.category).toBe('Awning')
    expect(parsed.family.brand).toBe('Tendital')
  })

  it('filters out template placeholder rows (only real product lines survive)', () => {
    // The fixture has ~100 rows in "Product lines"; ~95 are unfilled
    // template placeholders (Index + a Listino_acquisto sheet name only).
    expect(parsed.productLines).toHaveLength(5)
    expect(parsed.productLines.map((l) => l.name)).toContain('N95 L motorizzata - Filtrante Screen 525')
  })

  it('resolves a matrix-type product line\'s Listino_acquisto to widths/heights/matrix, not a raw number', () => {
    const matrixLine = parsed.productLines.find((l) => l.name.startsWith('N95 L'))!
    expect(matrixLine.listinoAcquisto).toHaveProperty('widths')
    expect(matrixLine.listinoAcquisto).toHaveProperty('matrix')
  })

  it('parses characteristics with correct hierarchy and sub-characteristic count', () => {
    expect(parsed.characteristics).toHaveLength(5)
    const tipoTessuto = parsed.characteristics.find((c) => c.name === 'Tipo Tessuto')!
    expect(tipoTessuto.subCharacters).toHaveLength(3)
    expect(tipoTessuto.subCharacters.map((s) => s.name)).toEqual(['Standard', 'Speciale classe 1', 'Speciale classe 2'])
  })

  it('parses relations linking product lines to their applicable characteristics', () => {
    expect(parsed.relations).toHaveLength(11)
    expect(parsed.relations).toContainEqual({
      productLineName: 'N95 L motorizzata - Filtrante Screen 525',
      characteristicName: 'Colore struttura',
    })
  })

  it('throws a clear error for a workbook missing a required sheet', () => {
    // A minimal xlsx with no "Product Family" sheet at all.
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Not The Right Sheet')
    const badBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    expect(() => parseProductFamilyWorkbook(badBuffer)).toThrow(/Product Family/)
  })
})

describe('extractEmbeddedImages (real fixture)', () => {
  it('extracts the 3 images embedded in the "Product Family" sheet, sorted by anchor row', async () => {
    const images = await extractEmbeddedImages(fixtureBuffer, 'Product Family')
    expect(images).toHaveLength(3)
    expect(images.map((i) => i.row)).toEqual([6, 8, 10])
    for (const image of images) {
      expect(image.data.length).toBeGreaterThan(0)
    }
  })

  it('returns an empty array for a sheet with no drawings', async () => {
    const images = await extractEmbeddedImages(fixtureBuffer, 'Product lines')
    expect(images).toEqual([])
  })
})
