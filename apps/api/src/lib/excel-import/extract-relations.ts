import * as XLSX from 'xlsx'

import type { RawRelation } from './types'

interface RelationRow {
  'Product line / Caracteristics'?: string
  [characteristicName: string]: unknown
}

/**
 * Extracts which characteristics apply to which product line from the
 * optional "Relations" sheet: one row per product line, one column per
 * characteristic name, a truthy cell meaning "applies." Missing sheet is
 * not an error — a family with no characteristics has nothing to relate.
 * @param workbook - Parsed workbook (`extractWorkbook`)
 */
export const extractRelations = (workbook: XLSX.WorkBook): RawRelation[] => {
  if (!workbook.SheetNames.includes('Relations')) {
    return []
  }

  const sheet = workbook.Sheets['Relations']
  const rows = XLSX.utils.sheet_to_json<RelationRow>(sheet)

  const relations: RawRelation[] = []
  for (const row of rows) {
    const productLineName = row['Product line / Caracteristics']
    if (!productLineName) {
      continue
    }
    for (const [characteristicName, value] of Object.entries(row)) {
      if (characteristicName === 'Product line / Caracteristics' || !value) {
        continue
      }
      relations.push({ productLineName, characteristicName })
    }
  }

  return relations
}
