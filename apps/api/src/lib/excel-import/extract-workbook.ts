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
