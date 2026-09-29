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
