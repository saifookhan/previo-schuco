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
  createdAt: string
  updatedAt: string
  /** List endpoint only: the owning company's name, when the caller may read it. */
  ownerCompanyName?: string | null
  /** List endpoint only: default discount this family was shared with the caller at; null for the caller's own. */
  shareDiscountPct?: number | null
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
  unitName: string
  unitSymbol: string
  discountPct: string
  markupPct: string
  installationHoursPerUnit: string
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
  /** Default discount this family was shared with the caller's company at (null if own or shared at 0%). */
  shareDiscountPct?: number | null
}
