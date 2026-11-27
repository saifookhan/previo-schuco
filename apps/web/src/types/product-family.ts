import type { FamilyShareValues } from '@schuco/contracts'

export interface ProductFamilySummary {
  id: string
  supplierCompanyId: string
  name: string
  technicalName: string | null
  category: string | null
  brand: string | null
  version: number
  supersedesId: string | null
  isPublished: boolean
  /** Only families ready for invoicing are offered for new quote positions. */
  readyForInvoicing: boolean
  /** "Con listino": there are prices behind the family. Information only. */
  hasPriceList: boolean
  /** `YYYY-MM-DD`, inclusive; null = no lower limit (families imported before validity existed). */
  priceValidFrom: string | null
  /** `YYYY-MM-DD`, inclusive; null = until further notice. */
  priceValidTo: string | null
  /** Set when a company admin archives the family. Null or absent means it is on the list. */
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
  /** List endpoint only: the owning company's name, when the caller may read it. */
  ownerCompanyName?: string | null
  /** List endpoint only: the highest discount a share of this family with the caller gives on any line or option; null for the caller's own. */
  shareDiscountPct?: number | null
  /** List endpoint only: whether the family is in the caller's company library ("In libreria"). */
  inLibrary?: boolean
}

export interface ProductFamilyImage {
  id: string
  productFamilyId: string
  title: string | null
  localPath: string
  sortOrder: number
}

export interface ProductLine {
  id: string
  productFamilyId: string
  name: string
  description: string | null
  formula: string
  value: string
  pricingMatrixId: string | null
  /** Lowest purchase price per unit (v2 template); null = none. */
  minValue: string | null
  unitName: string
  unitSymbol: string
  /** Null = empty in the Excel: 0% discount, 100% markup (none), 0 hours. */
  discountPct: string | null
  markupPct: string | null
  installationHoursPerUnit: string | null
  sortOrder: number
}

export interface Characteristic {
  id: string
  productFamilyId: string
  parentId: string | null
  name: string
  isApplicable: boolean
  formula: string | null
  value: string | null
  pricingMatrixId: string | null
  /** v2 options: own minimum purchase price, discount and markup (out of 100), and the installation hours they add. Null = not set (the position's discount/markup apply). */
  minValue: string | null
  discountPct: string | null
  markupPct: string | null
  installationHoursPerUnit: string | null
  sortOrder: number
}

export interface PricingMatrix {
  id: string
  productFamilyId: string
  widths: number[]
  heights: number[]
  /** ERROR/ERRORE cells from the source sheet round-trip through JSON as null, not NaN. */
  matrix: (number | null)[][]
}

export interface ProductFamilyDetail {
  family: ProductFamilySummary & {
    description1: string | null
    description2: string | null
    /** v2 template: free-text note (often a link to technical documentation) and the distributor. */
    note: string | null
    distributor: string | null
    sourceExcelPath: string | null
    supersedesId: string | null
    duplicatedFromId: string | null
  }
  images: ProductFamilyImage[]
  lines: ProductLine[]
  characteristics: Characteristic[]
  matrices: PricingMatrix[]
  relations: { productLineId: string; characteristicId: string }[]
  /** False when the server's edit policy locks this family (e.g. published under `draft-only`). */
  editable: boolean
  /** Whether the caller may open this family's History panel (owning company or super-admin). */
  canViewHistory: boolean
  /** Owning company or super-admin: may upload a new version and change the price validity. */
  canManage: boolean
  /** What the share of this family with the caller's company gives it, by product line or option id (null for its own families). */
  shareItems?: Record<string, FamilyShareValues> | null
  /** Whether the family is in the caller's company library ("In libreria"). */
  inLibrary: boolean
}
