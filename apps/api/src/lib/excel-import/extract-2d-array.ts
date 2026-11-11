import * as XLSX from 'xlsx'

import type { RawPricingMatrix } from './types'

/**
 * Parses a "matrix sheet" (a BxH pricing table) laid out as: row 0 =
 * [blank/label, width1, width2, ...], every subsequent row =
 * [height, price1, price2, ...]. Ported from the reference implementation
 * (`extract2DArray.js`), same shape.
 * @param rows - Sheet rows as arrays (xlsx `sheet_to_json(sheet, { header: 1 })` output)
 */
export const extract2DArray = (rows: unknown[][]): RawPricingMatrix => {
  const isNumberOrString = (value: unknown): value is number | string =>
    typeof value === 'string' || typeof value === 'number'

  const headerRow = rows[0] ?? []
  const rawWidths = headerRow.slice(1).filter(isNumberOrString).map(Number)

  const rawHeights = rows
    .map((row) => row[0])
    .slice(1)
    .filter(isNumberOrString)
    .map(Number)

  const rawMatrix = rows
    .map((row) => row.slice(1).filter(isNumberOrString).map(Number))
    .slice(1)
    .filter((row) => row.length > 0)

  // A trailing non-numeric header cell (a note, "ERROR", …) becomes NaN and
  // would otherwise be stored as a phantom `null` axis entry — an extra
  // column/row that no size can ever match and that can't be edited into a
  // valid (strictly ascending) axis. Drop such entries along with their
  // row/column. (Data cells that are NaN are kept: that's "no price".)
  const keepWidth = rawWidths.map((w) => Number.isFinite(w))
  const widths = rawWidths.filter((_, i) => keepWidth[i])
  const alignedRows = rawHeights.length === rawMatrix.length
  const keepHeight = rawHeights.map((h) => Number.isFinite(h))
  const heights = rawHeights.filter((_, i) => keepHeight[i])
  const matrix = rawMatrix
    .filter((_, i) => !alignedRows || keepHeight[i])
    .map((row) => row.filter((_, i) => keepWidth[i] !== false))

  return { widths, heights, matrix }
}

/**
 * The BxH price table on sheet `sheetName` (see `extract2DArray`).
 * @param workbook - Parsed workbook (`extractWorkbook`)
 * @param sheetName - The price list column's value, naming the sheet
 * @param usedBy - What names it, for the error ("Product line \"X\"")
 * @throws if the workbook has no such sheet — the price would otherwise be silently empty
 */
export const extractPriceSheet = (workbook: XLSX.WorkBook, sheetName: unknown, usedBy: string): RawPricingMatrix => {
  const name = String(sheetName ?? '').trim()
  if (!name || !workbook.SheetNames.includes(name)) {
    throw new Error(`${usedBy} uses the price table "${name}", but the workbook has no sheet with that name`)
  }
  return extract2DArray(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1 }))
}

/** A number cell, or null when blank (or not a number). */
export const optionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** The price list sheet names the template fills in by default: "LP<n>" for lines, "C<n>_<row>" for options. */
const TEMPLATE_SHEET_NAME = /^(LP\d+|C\d+_\d+)$/

/**
 * A line's or option's purchase price. A "Tabella BxH" type reads the price table its price
 * list column names. Otherwise a blank cell, or the template's untouched default sheet name,
 * is 0 (a "for itself" family can price everything through its options); another sheet name
 * is a price table too (v1 lines relied on that); anything else must be a number.
 * @throws if a price table sheet is missing, or the value is neither a number nor a sheet
 */
export const resolvePurchasePrice = (
  workbook: XLSX.WorkBook,
  priceListType: string | null,
  listino: unknown,
  usedBy: string,
): number | RawPricingMatrix => {
  if (priceListType?.includes('Tabella BxH')) {
    return extractPriceSheet(workbook, listino, usedBy)
  }
  const text = typeof listino === 'string' ? listino.trim() : null
  if (listino == null || text === '' || (text && TEMPLATE_SHEET_NAME.test(text))) {
    return 0
  }
  if (text && workbook.SheetNames.includes(text)) {
    return extractPriceSheet(workbook, text, usedBy)
  }
  const price = optionalNumber(listino)
  if (price === null) {
    throw new Error(`${usedBy} has the price "${String(listino)}", which is neither a number nor a sheet of the workbook`)
  }
  return price
}
