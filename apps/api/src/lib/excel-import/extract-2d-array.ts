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
  const widths = headerRow.slice(1).filter(isNumberOrString).map(Number)

  const heights = rows
    .map((row) => row[0])
    .slice(1)
    .filter(isNumberOrString)
    .map(Number)

  const matrix = rows
    .map((row) => row.slice(1).filter(isNumberOrString).map(Number))
    .slice(1)
    .filter((row) => row.length > 0)

  return { widths, heights, matrix }
}
