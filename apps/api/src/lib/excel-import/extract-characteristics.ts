import * as XLSX from 'xlsx'

import { optionalNumber, resolvePurchasePrice } from './extract-2d-array'
import type { RawCharacteristic } from './types'

/**
 * Extracts the hierarchical characteristics from the "Caracteristics"
 * sheet. Layout (matches the reference implementation exactly, this isn't
 * a guess): row index 1 holds the main characteristic names, one per
 * column, with the column's own index (`colIndex`) tracked. Every row
 * from the one containing "Nome valore" onward holds sub-characteristics,
 * starting at the main characteristic's `colIndex`: [name, price-list
 * type, price] in a v1 workbook; in a v2 one followed by [MinValue,
 * Sconto %, MarkUp %, Ore di posa x UM] (told by the "MinValue" header
 * after the price). A price naming a sheet is a BxH table.
 * @param workbook - Parsed workbook (`extractWorkbook`)
 * @throws if the "Caracteristics" sheet is missing, or an option's price can't be read
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

  const headerIndex = rows.findIndex((row) => row.includes('Nome valore'))
  const header = rows[headerIndex] ?? []
  const subCharacterRows = rows.slice(headerIndex + 1)

  for (const main of mainCharacteristics) {
    const isV2 = String(header[main.colIndex + 3] ?? '').trim() === 'MinValue'
    for (const row of subCharacterRows) {
      const [name, priceListType, priceCell, minValue, discountPct, markupPct, hours] = row.slice(
        main.colIndex,
        main.colIndex + (isV2 ? 7 : 3),
      )
      if (!name) {
        continue
      }

      const priceListTypeStr = priceListType != null ? String(priceListType) : null
      const price = resolvePurchasePrice(workbook, priceListTypeStr, priceCell, `Option "${main.name}: ${String(name)}"`)
      // A "%" type's price is a fraction in the sheet (0.1 = 10%).
      const listinoAcquisto = typeof price === 'number' && priceListTypeStr?.includes('%') ? price * 100 : price

      main.subCharacters.push({
        name: String(name),
        priceListType: priceListTypeStr,
        listinoAcquisto,
        minValue: isV2 ? optionalNumber(minValue) : null,
        discountPct: isV2 ? optionalNumber(discountPct) : null,
        markupPct: isV2 ? optionalNumber(markupPct) : null,
        installationHoursPerUnit: isV2 ? optionalNumber(hours) : null,
      })
    }
  }

  return mainCharacteristics
}
