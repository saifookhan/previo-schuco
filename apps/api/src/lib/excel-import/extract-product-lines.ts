import * as XLSX from 'xlsx'

import { optionalNumber, resolvePurchasePrice } from './extract-2d-array'
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
 * caller to figure out (see `resolvePurchasePrice`). Rows missing a name or
 * unit are template placeholder rows (confirmed in a real workbook — dozens
 * of rows with only an Index and a `Listino_acquisto` sheet name), not data;
 * filtered out, not imported as broken product lines. A blank price is 0.
 * @param workbook - Parsed workbook (`extractWorkbook`)
 * @throws if the "Product lines" sheet is missing, or a line's price can't be read
 */
export const extractProductLines = (workbook: XLSX.WorkBook): RawProductLine[] => {
  if (!workbook.SheetNames.includes('Product lines')) {
    throw new Error('The workbook does not have a sheet named "Product lines"')
  }

  const sheet = workbook.Sheets['Product lines']
  const rows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet)
    .map(trimKeys)

  const filtered = rows.filter((row) => row.Nome_linea_prodotto && row.Nome_UM && row.Simbolo_UM)

  return filtered.map((row) => {
    const name = String(row.Nome_linea_prodotto)
    const priceListType = row.Tipo_Listino != null ? String(row.Tipo_Listino) : null
    return {
      name,
      description: (row.Descrizione_opzionale as string) ?? null,
      priceListType,
      listinoAcquisto: resolvePurchasePrice(workbook, priceListType, row.Listino_acquisto, `Product line "${name}"`),
      minValue: optionalNumber(row.MinValue),
      unitName: row.Nome_UM as string,
      unitSymbol: row.Simbolo_UM as string,
      discountPct: optionalNumber(row['Sconto %']),
      markupPct: optionalNumber(row['MarkUp %']),
      installationHoursPerUnit: optionalNumber(row['Ore di posa x UM']),
    }
  })
}
