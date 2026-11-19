/**
 * Excel import contract (ADR TBD) — a workbook must have these exact sheet
 * names. Two template versions are read: v1, and v2 (adds "Note" and
 * "Distributore" to the family, "MinValue" to lines, and per option its own
 * MinValue, discount, markup and installation hours). Which one is told by
 * the headers, so both keep importing. Column headers inside "Product lines" and "Caracteristics" are
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
  /** v2 template only. */
  note?: string
  distributor?: string
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
  installationHoursPerUnit: number | null
  unitName: string
  unitSymbol: string
  /** A fixed number when the price list column held a plain value (0 when blank); a matrix when it named another sheet. */
  listinoAcquisto: number | RawPricingMatrix
  priceListType: string | null
  /** v2 template: the lowest purchase price per unit; null when blank or a v1 workbook. */
  minValue: number | null
}

export interface RawSubCharacteristic {
  name: string
  priceListType: string | null
  /** A fixed number, or a matrix when the sub-characteristic's own price list column named a sheet. */
  listinoAcquisto: number | RawPricingMatrix
  /**
   * v2 template only (seven columns per characteristic instead of three); all null for a v1
   * workbook. Discount and markup are the sheet's raw fractions (0.3, 1.5), like a line's.
   */
  minValue: number | null
  discountPct: number | null
  markupPct: number | null
  installationHoursPerUnit: number | null
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
  /** 1 or 2 (see `detectTemplateVersion`) — a few price list formulas differ between them. */
  templateVersion: 1 | 2
  family: RawProductFamilyRow
  productLines: RawProductLine[]
  characteristics: RawCharacteristic[]
  relations: RawRelation[]
}
