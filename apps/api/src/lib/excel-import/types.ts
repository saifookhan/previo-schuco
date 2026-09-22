/**
 * Excel import contract (ADR TBD) — a workbook must have these exact sheet
 * names. Column headers inside "Product lines" and "Caracteristics" are
 * Italian (the business's own naming, not ours to relabel) — see each
 * extractor for the exact expected headers. Ported from a working
 * reference implementation (anqa-fabbrika-estimator), adapted to this
 * project's schema.
 */
export const REQUIRED_SHEETS = ['Product Family', 'Product lines', 'Caracteristics'] as const
/** "Relations" is optional — a family with no characteristics has nothing to relate. */
export const OPTIONAL_SHEETS = ['Relations'] as const

export interface RawProductFamilyRow {
  family_name?: string
  technical_name?: string
  category?: string
  brand?: string
  [key: string]: unknown
}

export interface RawPricingMatrix {
  widths: number[]
  heights: number[]
  matrix: number[][]
}

export interface RawProductLine {
  name: string
  description: string | null
  discountPct: number | null
  markupPct: number | null
  installationHoursPerUnit: number
  unitName: string
  unitSymbol: string
  /** A fixed number when the price list column held a plain value; a matrix when it named another sheet. */
  listinoAcquisto: number | RawPricingMatrix
  priceListType: string | null
}

export interface RawSubCharacteristic {
  name: string
  priceListType: string | null
  /** A fixed number, or a matrix when the sub-characteristic's own price list column named a sheet. */
  listinoAcquisto: number | RawPricingMatrix
}

export interface RawCharacteristic {
  name: string
  colIndex: number
  subCharacters: RawSubCharacteristic[]
}

export interface RawRelation {
  productLineName: string
  characteristicName: string
}

export interface ParsedWorkbook {
  family: RawProductFamilyRow
  productLines: RawProductLine[]
  characteristics: RawCharacteristic[]
  relations: RawRelation[]
}
