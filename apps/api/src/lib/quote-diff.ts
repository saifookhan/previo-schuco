import type { QuoteChange, QuoteDocument, QuoteFamily, QuoteLine } from '@schuco/contracts'

type Scalar = string | number | boolean | null

const HEADER_FIELDS = ['customerName', 'customerFiscalCode', 'customerAddress', 'customerCity', 'projectLocation', 'quoteDate', 'notes'] as const
const FAMILY_FIELDS = ['name', 'category', 'isAlternative', 'description', 'notes'] as const
const LINE_FIELDS = [
  'code',
  'name',
  'quantity',
  'unit',
  'widthMm',
  'heightMm',
  'priceMode',
  'unitPrice',
  'extraMarkupPct',
  'discountPct',
  'vatRate',
  'installationHours',
  'locked',
  'isAlternative',
] as const

const optionsText = (line: QuoteLine): string => line.options.map((option) => `${option.name}: ${option.value}`).join(', ')
const lineLabel = (line: QuoteLine): string => [line.code, line.name].filter(Boolean).join(' ')

/** True when the ids common to both lists are in a different order. */
const reordered = (before: { id: string }[], after: { id: string }[]): boolean => {
  const kept = new Set(after.map((item) => item.id))
  const beforeOrder = before.filter((item) => kept.has(item.id)).map((item) => item.id)
  const present = new Set(beforeOrder)
  const afterOrder = after.filter((item) => present.has(item.id)).map((item) => item.id)
  return beforeOrder.join() !== afterOrder.join()
}

const diffLines = (family: string, before: QuoteFamily, after: QuoteFamily, changes: QuoteChange[]) => {
  const beforeById = new Map(before.lines.map((line) => [line.id, line]))
  const afterIds = new Set(after.lines.map((line) => line.id))
  for (const line of before.lines) {
    if (!afterIds.has(line.id)) changes.push({ kind: 'line_removed', family, line: lineLabel(line) })
  }
  for (const line of after.lines) {
    const old = beforeById.get(line.id)
    if (!old) {
      changes.push({ kind: 'line_added', family, line: lineLabel(line) })
      continue
    }
    for (const field of LINE_FIELDS) {
      if (old[field] !== line[field]) {
        changes.push({ kind: 'line_changed', family, line: lineLabel(line), field, from: old[field] as Scalar, to: line[field] as Scalar })
      }
    }
    if (optionsText(old) !== optionsText(line)) {
      changes.push({ kind: 'line_changed', family, line: lineLabel(line), field: 'options', from: optionsText(old), to: optionsText(line) })
    }
  }
  if (reordered(before.lines, after.lines)) changes.push({ kind: 'lines_reordered', family })
}

/**
 * What changed from one saved document to the next, for the quote's history: field by field for
 * the header, families and lines (matched by id), and one entry each for the intro, the closing
 * and the print settings when anything in them changed.
 */
export const diffQuoteDocuments = (before: QuoteDocument, after: QuoteDocument): QuoteChange[] => {
  const changes: QuoteChange[] = []
  for (const field of HEADER_FIELDS) {
    if (before.header[field] !== after.header[field]) {
      changes.push({ kind: 'header', field, from: before.header[field], to: after.header[field] })
    }
  }
  if (JSON.stringify(before.intro) !== JSON.stringify(after.intro)) changes.push({ kind: 'intro' })

  const beforeById = new Map(before.families.map((family) => [family.id, family]))
  const afterIds = new Set(after.families.map((family) => family.id))
  for (const family of before.families) {
    if (!afterIds.has(family.id)) changes.push({ kind: 'family_removed', family: family.name })
  }
  for (const family of after.families) {
    const old = beforeById.get(family.id)
    if (!old) {
      changes.push({ kind: 'family_added', family: family.name })
      continue
    }
    if (old.productFamilyId !== family.productFamilyId) {
      changes.push({ kind: 'family_changed', family: family.name, field: 'productFamilyId', from: old.productFamilyId, to: family.productFamilyId })
    }
    for (const field of FAMILY_FIELDS) {
      if (old[field] !== family[field]) {
        changes.push({ kind: 'family_changed', family: family.name, field, from: old[field], to: family[field] })
      }
    }
    diffLines(family.name, old, family, changes)
  }
  if (reordered(before.families, after.families)) changes.push({ kind: 'families_reordered' })

  if (JSON.stringify(before.closing) !== JSON.stringify(after.closing)) changes.push({ kind: 'closing' })
  if (JSON.stringify(before.printSettings) !== JSON.stringify(after.printSettings)) changes.push({ kind: 'print_settings' })
  return changes
}
