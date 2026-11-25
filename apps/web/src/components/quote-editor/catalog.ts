import type { QuoteFamily, QuoteLine, QuoteLineOption } from '@schuco/contracts'

import type { Characteristic, ProductFamilyDetail } from '@/types/product-family'

import { newLocalId } from './shared'

/** The options a catalog line offers: each characteristic linked to it, with its values. */
export const lineCharacteristics = (
  detail: ProductFamilyDetail,
  productLineId: string | null,
): { main: Characteristic; values: Characteristic[] }[] =>
  productLineId === null
    ? []
    : detail.relations
        .filter((relation) => relation.productLineId === productLineId)
        .map((relation) => detail.characteristics.find((c) => c.id === relation.characteristicId && !c.parentId))
        .filter((main): main is Characteristic => Boolean(main))
        .map((main) => ({ main, values: detail.characteristics.filter((c) => c.parentId === main.id) }))

/** A new line of the catalog family: its first catalog line, priced once it has a size. */
export const newCatalogLine = (detail: ProductFamilyDetail, code: string): QuoteLine => {
  const first = detail.lines[0]
  return {
    id: newLocalId('l'),
    code,
    productLineId: first?.id ?? null,
    name: first?.name ?? '',
    quantity: 1,
    unit: first?.unitSymbol ?? 'pz',
    widthMm: null,
    heightMm: null,
    options: [],
    priceMode: first ? 'catalog' : 'manual',
    unitPrice: 0,
    extraMarkupPct: 0,
    discountPct: 0,
    vatRate: '22%',
    installationHours: first?.installationHoursPerUnit == null ? null : Number(first.installationHoursPerUnit),
    locked: false,
    isAlternative: false,
  }
}

/** A line typed in by hand (or added to a hand-typed family). */
export const newManualLine = (code: string): QuoteLine => ({
  id: newLocalId('l'),
  code,
  productLineId: null,
  name: '',
  quantity: 1,
  unit: 'pz',
  widthMm: null,
  heightMm: null,
  options: [],
  priceMode: 'manual',
  unitPrice: 0,
  extraMarkupPct: 0,
  discountPct: 0,
  vatRate: '22%',
  installationHours: null,
  locked: false,
  isAlternative: false,
})

/** The next free "Pos" number of the family ("1", "2", …), after the highest one used. */
export const nextLineCode = (family: QuoteFamily): string =>
  String(family.lines.reduce((max, line) => Math.max(max, Number(line.code.replace(/\D/g, '')) || 0), 0) + 1)

/** A family taken from the catalog, with one line to start from. */
export const familyFromCatalog = (detail: ProductFamilyDetail): QuoteFamily => ({
  id: newLocalId('f'),
  productFamilyId: detail.family.id,
  name: detail.family.name,
  category: detail.family.category ?? '',
  isAlternative: false,
  description: detail.family.description1 ?? '',
  notes: detail.family.description2 ?? '',
  lines: [newCatalogLine(detail, '1')],
})

export const emptyFamily = (name: string): QuoteFamily => ({
  id: newLocalId('f'),
  productFamilyId: null,
  name,
  category: '',
  isAlternative: false,
  description: '',
  notes: '',
  lines: [],
})

export interface SpecificationRow {
  kind: 'header' | 'detail'
  label: string
  positions: string
  value: string
}

/**
 * "Dettagli & Specifiche": the family's product code and brand, then each option chosen on its
 * lines with the positions ("Pos") that have it — derived from the lines, never typed.
 */
export const familySpecifications = (family: QuoteFamily, detail: ProductFamilyDetail | undefined, labels: { code: string; brand: string }): SpecificationRow[] => {
  const rows: SpecificationRow[] = []
  if (detail?.family.technicalName) rows.push({ kind: 'header', label: labels.code, positions: '', value: detail.family.technicalName })
  if (detail?.family.brand) rows.push({ kind: 'header', label: labels.brand, positions: '', value: detail.family.brand })
  const byOption = new Map<string, { label: string; value: string; positions: string[] }>()
  for (const line of family.lines) {
    for (const option of line.options) {
      const key = `${option.name}\u0000${option.value}`
      const row = byOption.get(key) ?? { label: option.name, value: option.value, positions: [] }
      if (!row.positions.includes(line.code)) row.positions.push(line.code)
      byOption.set(key, row)
    }
  }
  for (const row of byOption.values()) {
    rows.push({ kind: 'detail', label: row.label, positions: row.positions.join(', '), value: row.value })
  }
  return rows
}

/**
 * The family moved onto a newer version of its catalog family: each line keeps its catalog line
 * and options by name; a line the newer version no longer has keeps its price as typed in
 * ("manual"), and is reported.
 */
export const switchFamilyVersion = (
  family: QuoteFamily,
  newer: ProductFamilyDetail,
): { family: QuoteFamily; unmatched: string[] } => {
  const unmatched: string[] = []
  const lines = family.lines.map((line): QuoteLine => {
    if (line.productLineId === null) return line
    const match = newer.lines.find((candidate) => candidate.name === line.name)
    if (!match) {
      unmatched.push([line.code, line.name].filter(Boolean).join(' '))
      return { ...line, productLineId: null, priceMode: 'manual', options: [] }
    }
    const options: QuoteLineOption[] = []
    for (const option of line.options) {
      const main = newer.characteristics.find((c) => !c.parentId && c.name === option.name)
      const sub = main && newer.characteristics.find((c) => c.parentId === main.id && c.name === option.value)
      if (main && sub) {
        options.push({ characteristicId: main.id, subCharacteristicId: sub.id, name: main.name, value: sub.name })
      } else {
        unmatched.push(`${[line.code, line.name].filter(Boolean).join(' ')} — ${option.name}: ${option.value}`)
      }
    }
    return { ...line, productLineId: match.id, options }
  })
  return { family: { ...family, productFamilyId: newer.family.id, lines }, unmatched }
}

/** The catalog-priced lines of the document that need a price, keyed by line id. */
export const catalogPricingKey = (familyId: string, line: QuoteLine): string =>
  JSON.stringify([familyId, line.productLineId, line.widthMm, line.heightMm, line.options.map((o) => o.subCharacteristicId)])
