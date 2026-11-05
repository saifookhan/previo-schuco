import { countFamilyChanges, diffFamilyVersions, diffPriceTables, type FamilyVersionSnapshot } from '@schuco/contracts'
import { describe, expect, it } from 'vitest'

const family: FamilyVersionSnapshot['family'] = {
  name: 'Finestra',
  technicalName: null,
  category: 'Windows',
  brand: null,
  description1: 'First text',
  description2: null,
  hasPriceList: true,
  priceValidFrom: '2026-01-01',
  priceValidTo: null,
}

const line = (id: string, name: string, overrides: Partial<FamilyVersionSnapshot['lines'][number]> = {}) => ({
  id,
  name,
  description: null,
  formula: 'valore',
  value: '10.0000',
  pricingMatrixId: null,
  unitName: 'Pezzo',
  unitSymbol: 'pz',
  discountPct: '0.0000',
  markupPct: '100.0000',
  installationHoursPerUnit: '0',
  sortOrder: 0,
  ...overrides,
})

const option = (id: string, name: string, parentId: string | null = null, value: string | null = null) => ({
  id,
  parentId,
  name,
  isApplicable: true,
  formula: null,
  value,
  pricingMatrixId: null,
  sortOrder: 0,
})

const base: FamilyVersionSnapshot = {
  family,
  lines: [line('l1', 'Battente'), line('l2', 'Fisso', { sortOrder: 1 })],
  characteristics: [option('c1', 'Colore'), option('c1a', 'RAL 9010', 'c1', '5')],
  matrices: [],
  relations: [{ productLineId: 'l1', characteristicId: 'c1' }],
}

describe('diffFamilyVersions', () => {
  it('finds nothing between two imports of the same data, whatever the ids and number formatting', () => {
    const reimport: FamilyVersionSnapshot = {
      ...base,
      lines: [line('n1', 'Battente', { value: 10 }), line('n2', 'fisso ', { sortOrder: 1 })],
      characteristics: [option('d1', 'Colore'), option('d1a', 'RAL 9010', 'd1', '5.0000')],
      relations: [{ productLineId: 'n1', characteristicId: 'd1' }],
    }
    expect(diffFamilyVersions(base, reimport)).toEqual([])
  })

  it('sorts each change into added, removed, economic or description', () => {
    const newer: FamilyVersionSnapshot = {
      family: { ...family, description1: 'New text', priceValidTo: '2026-12-31' },
      lines: [line('n1', 'Battente', { markupPct: '110', unitName: 'Unità' }), line('n3', 'Scorrevole', { sortOrder: 2 })],
      characteristics: [option('d1', 'Colore'), option('d1a', 'RAL 9010', 'd1', '6'), option('d2', 'Vetro')],
      matrices: [],
      relations: [{ productLineId: 'n1', characteristicId: 'd2' }],
    }
    const changes = diffFamilyVersions(base, newer)
    expect(countFamilyChanges(changes)).toEqual({
      added: 3, // line Scorrevole, option Vetro, Battente now offers Vetro
      removed: 2, // line Fisso, Battente no longer offers Colore
      economic: 3, // valid to, Battente markup, RAL 9010 value
      description: 2, // description 1, Battente unit name
    })
    expect(changes.map((section) => section.type === 'section' && section.id)).toEqual(['details', 'lines', 'options'])
    const details = changes[0].type === 'section' ? changes[0].children : []
    expect(details).toContainEqual(
      expect.objectContaining({ field: 'priceValidTo', kind: 'economic', before: null, after: '2026-12-31' }),
    )
  })

  it('reports switching between a fixed price and a price table as one economic change', () => {
    const newer: FamilyVersionSnapshot = {
      ...base,
      lines: [line('n1', 'Battente', { pricingMatrixId: 'm1' }), line('n2', 'Fisso', { sortOrder: 1 })],
      matrices: [{ id: 'm1', widths: [500], heights: [500], matrix: [[100]] }],
      relations: [{ productLineId: 'n1', characteristicId: 'c1' }],
    }
    const [section] = diffFamilyVersions(base, newer)
    expect(section).toMatchObject({
      id: 'lines',
      children: [{ name: 'Battente', children: [{ field: 'priceSource', kind: 'economic', before: '10', after: 'table' }] }],
    })
  })
})

describe('diffPriceTables', () => {
  it('matches cells by size, so a new size column is not read as every price changing', () => {
    const older = { id: 'a', widths: [500, 1000], heights: [500], matrix: [[100, 200]] }
    const newer = { id: 'b', widths: [500, 750, 1000], heights: [500], matrix: [[110, 150, 200]] }
    expect(diffPriceTables(older, newer)).toEqual({
      widths: [500, 750, 1000],
      heights: [500],
      cells: [
        { width: 500, height: 500, before: 100, after: 110 },
        { width: 750, height: 500, before: null, after: 150 },
      ],
      pricedCells: 3,
      minPct: 10,
      maxPct: 10,
    })
  })

  it('is null when every price is the same', () => {
    const table = { id: 'a', widths: [500], heights: [500], matrix: [[100]] }
    expect(diffPriceTables(table, { ...table, id: 'b' })).toBeNull()
  })
})
