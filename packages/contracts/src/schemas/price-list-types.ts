/**
 * Every `Tipo_Listino` label the Excel import recognizes, mapped to its mathjs
 * formula. `null` means the price comes from a width × height table instead.
 * Hand-verified against a supplier workbook's "Elenchi" sheet — not parsed from
 * Excel notation. The API keeps the v1 exception (`2xAltezza`) next to the importer.
 */
export const PRICE_LIST_TYPE_FORMULAS: Record<string, string | null> = {
  'Valore_Fisso [€/Pz]': 'valore',
  'Perimetro x [€/m]': '((B+H)*2/1000) * valore',
  'Base x [€/m]': '(B/1000) * valore',
  'Altezza x [€/m]': '(H/1000) * valore',
  'Superficie x [€/m2]': '((B*H)/1000000) * valore',
  '2xAltezza x [€/m]': '(H*2/1000) * valore',
  'Base+2xAltezza x [€/m]': '((H*2+B)/1000) * valore',
  'Ore di posa x [€/h]': 'ore_di_posa * valore',
  'Tabella BxH [€/Pz]': null,
  '% sul valore base del prodotto': 'valore_base_in_vendita * valore / 100',
}

/** The price-type label whose price is a width × height table. */
export const MATRIX_PRICE_LIST_TYPE = 'Tabella BxH [€/Pz]'

/** Sentinel the manual editor uses when the stored formula matches no known price type. */
export const CUSTOM_PRICE_LIST_TYPE = 'custom'

/**
 * The known price type whose formula is exactly `formula`, or `custom` when none is.
 * A missing formula is custom too — a price table is detected from the matrix, not from this.
 */
export const priceListTypeForFormula = (formula: string | null | undefined): string => {
  if (!formula) return CUSTOM_PRICE_LIST_TYPE
  const match = Object.entries(PRICE_LIST_TYPE_FORMULAS).find(([, value]) => value === formula)
  return match?.[0] ?? CUSTOM_PRICE_LIST_TYPE
}
