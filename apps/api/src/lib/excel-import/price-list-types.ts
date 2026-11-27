import { PRICE_LIST_TYPE_FORMULAS } from '@schuco/contracts'

/**
 * Re-exported so the importer and its tests keep one import path. The map itself
 * lives in `@schuco/contracts` — the manual editor uses the same labels and formulas.
 * Deliberately a hand-verified static map, not a live parser of the "Elenchi"
 * sheet's Excel-notation text. A workbook naming a type not in this map fails
 * the import loudly (`resolvePriceListType` below) instead of guessing.
 */
export { PRICE_LIST_TYPE_FORMULAS }

/** Where the v1 template's formula differs from the v2 one above. */
const V1_FORMULAS: Record<string, string> = {
  '2xAltezza x [€/m]': '(B*2/1000) * valore',
}

export type ResolvedPriceListType = { kind: 'formula'; formula: string } | { kind: 'matrix' }

/**
 * Resolves a `Tipo_Listino` label to its formula (or "this is a matrix
 * type") via `PRICE_LIST_TYPE_FORMULAS`.
 * @param tipoListino - The exact label from the "Product lines" or "Caracteristics" sheet
 * @param templateVersion - The workbook's template version (`ParsedWorkbook.templateVersion`)
 * @throws if the label isn't in the known map — never silently guesses a formula for an unrecognized pricing type
 */
export const resolvePriceListType = (tipoListino: string, templateVersion: 1 | 2 = 2): ResolvedPriceListType => {
  if (!(tipoListino in PRICE_LIST_TYPE_FORMULAS)) {
    throw new Error(
      `Unknown Tipo_Listino "${tipoListino}" — not in PRICE_LIST_TYPE_FORMULAS. Add its formula there ` +
        '(check the workbook\'s "Elenchi" sheet for the Excel-notation source) before importing.',
    )
  }

  const formula = (templateVersion === 1 ? V1_FORMULAS[tipoListino] : undefined) ?? PRICE_LIST_TYPE_FORMULAS[tipoListino]
  return formula === null ? { kind: 'matrix' } : { kind: 'formula', formula }
}
