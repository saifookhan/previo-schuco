import * as XLSX from 'xlsx'

import type { RawProductFamilyRow } from './types'

interface LabelValueRow {
  Label?: string
  Value?: unknown
}

/**
 * Extracts the family-level fields from the "Product Family" sheet — laid
 * out as Label/Value pairs (one row per field: "Nome_famiglia" /
 * "Tenda tecnica NEST", etc.), not one row with named columns. Confirmed
 * against a real supplier workbook, not guessed.
 * @param workbook - Parsed workbook (`extractWorkbook`)
 * @throws if the "Product Family" sheet is missing or has no Nome_famiglia row
 */
export const extractProductFamily = (workbook: XLSX.WorkBook): RawProductFamilyRow => {
  if (!workbook.SheetNames.includes('Product Family')) {
    throw new Error('The workbook does not have a sheet named "Product Family"')
  }

  const sheet = workbook.Sheets['Product Family']
  const rows = XLSX.utils.sheet_to_json<LabelValueRow>(sheet)

  const byLabel = new Map<string, unknown>()
  for (const row of rows) {
    if (row.Label) {
      byLabel.set(row.Label.trim(), row.Value)
    }
  }

  const familyName = byLabel.get('Nome_famiglia')
  if (!familyName || typeof familyName !== 'string') {
    throw new Error('The "Product Family" sheet must have a "Nome_famiglia" row with a value')
  }

  const asString = (label: string): string | undefined => {
    const value = byLabel.get(label)
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }

  return {
    family_name: familyName,
    technical_name: asString('Nome_tecnico_famiglia'),
    category: asString('Categoria prodotti'),
    // v1 "Brand/Fornitore", v2 "Brand" (with the distributor in its own row).
    brand: asString('Brand') ?? asString('Brand/Fornitore'),
    description_1: asString('Descrizione_1'),
    description_2: asString('Descrizione_2'),
    note: asString('Note'),
    distributor: asString('Distributore'),
  }
}
