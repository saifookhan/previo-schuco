import { extractCharacteristics } from './extract-characteristics'
import { extractProductFamily } from './extract-product-family'
import { extractProductLines } from './extract-product-lines'
import { extractRelations } from './extract-relations'
import { detectTemplateVersion, extractWorkbook } from './extract-workbook'
import type { ParsedWorkbook } from './types'

export * from './extract-2d-array'
export * from './extract-characteristics'
export * from './extract-product-family'
export * from './extract-product-lines'
export * from './extract-relations'
export * from './extract-workbook'
export * from './types'

/**
 * Parses an uploaded Excel file into every sheet this import format
 * defines. Throws on the first missing/malformed required sheet — the
 * caller (the import route) is expected to turn that into a 400, not a
 * partial import.
 * @param buffer - Raw uploaded file bytes
 */
export const parseProductFamilyWorkbook = (buffer: Buffer): ParsedWorkbook => {
  const workbook = extractWorkbook(buffer)

  return {
    templateVersion: detectTemplateVersion(workbook),
    family: extractProductFamily(workbook),
    productLines: extractProductLines(workbook),
    characteristics: extractCharacteristics(workbook),
    relations: extractRelations(workbook),
  }
}
