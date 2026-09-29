import * as XLSX from 'xlsx'

import { extract2DArray } from './extract-2d-array'
import type { RawCharacteristic } from './types'

/**
 * Extracts the hierarchical characteristics from the "Caracteristics"
 * sheet. Layout (matches the reference implementation exactly, this isn't
 * a guess): row index 1 holds the main characteristic names, one per
 * column, with the column's own index (`colIndex`) tracked. Every row
 * from the one containing "Nome valore" onward holds sub-characteristics,
 * three columns wide per main characteristic starting at its `colIndex`:
 * [name, price-list type, price]. A sub-characteristic whose type
 * includes "Tabella BxH" has its price column naming another sheet (a
 * matrix) instead of holding a number directly.
 * @param workbook - Parsed workbook (`extractWorkbook`)
 * @throws if the "Caracteristics" sheet is missing
 */
export const extractCharacteristics = (workbook: XLSX.WorkBook): RawCharacteristic[] => {
  if (!workbook.SheetNames.includes('Caracteristics')) {
    throw new Error('The workbook does not have a sheet named "Caracteristics"')
  }

  const sheet = workbook.Sheets['Caracteristics']
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

  const mainCharacteristics: RawCharacteristic[] = []
  ;(rows[1] ?? []).forEach((cell, colIndex) => {
    if (cell) {
      mainCharacteristics.push({ name: String(cell), colIndex, subCharacters: [] })
    }
  })

  const subCharacterStartIndex = rows.findIndex((row) => row.includes('Nome valore')) + 1
  const subCharacterRows = rows.slice(subCharacterStartIndex)

  for (const main of mainCharacteristics) {
    for (const row of subCharacterRows) {
      const [name, priceListType, priceCell] = row.slice(main.colIndex, main.colIndex + 3)
      if (!name) {
        continue
      }

      const priceListTypeStr = priceListType != null ? String(priceListType) : null
      const isMatrix = priceListTypeStr?.includes('Tabella BxH') ?? false

      const listinoAcquisto = isMatrix
        ? extract2DArray(
            XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[String(priceCell)], { header: 1 }),
          )
        : priceListTypeStr?.includes('%')
          ? Number(priceCell) * 100
          : Number(priceCell) || 0

      main.subCharacters.push({
        name: String(name),
        priceListType: priceListTypeStr,
        listinoAcquisto,
      })
    }
  }

  return mainCharacteristics
}
