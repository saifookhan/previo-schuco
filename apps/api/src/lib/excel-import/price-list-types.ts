/**
 * Every `Tipo_Listino`/`Nome_Tipo_Listino` value this import format
 * recognizes, mapped to its mathjs formula — verified against a real
 * supplier workbook's own "Elenchi" sheet (which documents exactly this
 * mapping in Excel notation), not guessed. `null` means "not a formula
 * type" — the price comes from a matrix lookup instead.
 *
 * Deliberately a hand-verified static map, not a live parser of the
 * "Elenchi" sheet's Excel-notation text (`"= (B/1000) x valore"` etc.) —
 * translating arbitrary Excel formula syntax into mathjs automatically is
 * exactly the kind of thing that's fine to get subtly wrong silently and
 * expensive to get wrong in a pricing engine. A workbook naming a type not
 * in this map fails the import loudly (`resolvePriceListType` below)
 * instead of guessing a translation.
 */
export const PRICE_LIST_TYPE_FORMULAS: Record<string, string | null> = {
  'Valore_Fisso [€/Pz]': 'valore',
  'Perimetro x [€/m]': '((B+H)*2/1000) * valore',
  'Base x [€/m]': '(B/1000) * valore',
  'Altezza x [€/m]': '(H/1000) * valore',
  'Superficie x [€/m2]': '((B*H)/1000000) * valore',
  // Twice the height (v2 template). The v1 template's "Elenchi" had "(B*2/1000)" here — kept for
  // v1 workbooks (see `V1_FORMULAS`), so re-importing one doesn't change its prices.
  '2xAltezza x [€/m]': '(H*2/1000) * valore',
  'Base+2xAltezza x [€/m]': '((H*2+B)/1000) * valore',
  'Ore di posa x [€/h]': 'ore_di_posa * valore',
  'Tabella BxH [€/Pz]': null,
  '% sul valore base del prodotto': 'valore_base_in_vendita * valore / 100',
}

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
