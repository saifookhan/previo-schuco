import * as XLSX from 'xlsx'

import { extract2DArray } from './extract-2d-array'
import type { RawProductLine } from './types'

/**
 * Real supplier workbooks are inconsistent about whitespace in header
 * names (a confirmed real example: `" Ore di posa x UM"` with a leading
 * space but no trailing one, while other columns have none at all) —
 * trim every key so a lookup never silently misses a column over
 * whitespace that means nothing to whoever built the sheet.
 * @param row - One `sheet_to_json` row
 */
const trimKeys = (row: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), value]))

/**
 * Extracts product lines from the "Product lines" sheet. `Listino_acquisto`
 * is either a plain number, or the name of another sheet in the same
 * workbook holding a BxH pricing matrix — resolved here, not left for the
 * caller to figure out. Rows missing a name/unit/price are template
 * placeholder rows (confirmed in a real workbook — dozens of rows with
 * only an Index and a `Listino_acquisto` sheet name), not data; filtered
 * out, not imported as broken product lines.
 * @param workbook - Parsed workbook (`extractWorkbook`)
 * @throws if the "Product lines" sheet is missing
 */
export const extractProductLines = (workbook: XLSX.WorkBook): RawProductLine[] => {
  if (!workbook.SheetNames.includes('Product lines')) {
    throw new Error('The workbook does not have a sheet named "Product lines"')
  }

  const sheet = workbook.Sheets['Product lines']
  const rows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet)
    .map(trimKeys)

  const filtered = rows.filter(
    (row) => row.Nome_linea_prodotto && row.Nome_UM && row.Simbolo_UM && row.Listino_acquisto != null,
  )

  return filtered.map((row) => {
    const listino = row.Listino_acquisto as string | number
    const resolvedListino =
      typeof listino === 'string' && workbook.SheetNames.includes(listino)
        ? extract2DArray(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[listino], { header: 1 }))
        : Number(listino)

    return {
      name: row.Nome_linea_prodotto as string,
      description: (row.Descrizione_opzionale as string) ?? null,
      priceListType: (row.Tipo_Listino as string) ?? null,
      listinoAcquisto: resolvedListino,
      unitName: row.Nome_UM as string,
      unitSymbol: row.Simbolo_UM as string,
      discountPct: (row['Sconto %'] as number) ?? null,
      markupPct: (row['MarkUp %'] as number) ?? null,
      installationHoursPerUnit: (row['Ore di posa x UM'] as number) ?? 0,
    }
  })
}
