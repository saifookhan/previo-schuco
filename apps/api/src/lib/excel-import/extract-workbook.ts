import * as XLSX from 'xlsx'

/**
 * Parses an uploaded Excel file (already read into memory server-side —
 * this never touches a browser FileReader, unlike the reference
 * implementation this was ported from) into an xlsx workbook.
 * @param buffer - Raw file bytes
 * @throws if the bytes aren't a valid workbook
 */
export const extractWorkbook = (buffer: Buffer): XLSX.WorkBook => {
  try {
    return XLSX.read(buffer, { type: 'buffer' })
  } catch {
    throw new Error('Failed to read the uploaded file as an Excel workbook')
  }
}

/**
 * Which version of the Excel template the workbook follows: 2 when "Product lines" has the
 * "MinValue" column version 2 added, otherwise 1.
 * @param workbook - Parsed workbook (`extractWorkbook`)
 */
export const detectTemplateVersion = (workbook: XLSX.WorkBook): 1 | 2 => {
  const sheet = workbook.Sheets['Product lines']
  const [header = []] = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) : []
  return header.some((cell) => String(cell ?? '').trim() === 'MinValue') ? 2 : 1
}
