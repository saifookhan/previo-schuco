export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected'

export interface QuoteSummary {
  id: string
  supplierCompanyId: string
  createdByUserId: string | null
  reference: string
  status: QuoteStatus
  customerName: string
  customerFiscalCode: string | null
  customerAddress: string | null
  customerCity: string | null
  projectLocation: string | null
  introText: string | null
  paymentTerms: string | null
  validityDays: number
  totalPrice: string
  createdAt: string
  updatedAt: string
}

export type PricingMode = 'auto' | 'manual'

export interface QuotePositionCharacteristic {
  id: string
  quotePositionId: string
  characteristicId: string
  subCharacteristicId: string
  characteristicName: string
  subCharacteristicName: string
  price: string
  pricingMode: PricingMode
  manualUnitPrice: string | null
  /** The option's own discount/markup (v2 families); null = the position's applied to it. */
  discountPct: string | null
  markupPct: string | null
}

export interface QuotePosition {
  id: string
  quoteId: string
  productFamilyId: string
  productLineId: string
  productFamilyName: string
  productLineName: string
  positionCode: string
  quantity: number
  widthMm: string
  heightMm: string
  description: string
  unitName: string
  unitSymbol: string
  discountPct: string
  extraMarkupPct: string
  pricingMode: PricingMode
  lineManualUnitPrice: string | null
  totalM2: string
  basePrice: string
  finalPrice: string
  sortOrder: number
  characteristics: QuotePositionCharacteristic[]
  /** False once this position's catalog family is no longer published (e.g. superseded by a newer version) — display-only, never changes the snapshotted price. */
  isValid: boolean
}

export interface QuoteDetail {
  quote: QuoteSummary
  positions: QuotePosition[]
}

/** Input for creating a new draft quote. */
export interface CreateQuoteInput {
  reference: string
  customerName: string
  customerFiscalCode?: string
  customerAddress?: string
  customerCity?: string
  projectLocation?: string
  introText?: string
  paymentTerms?: string
  validityDays?: number
}

export interface AddQuotePositionInput {
  productFamilyId: string
  productLineId: string
  quantity: number
  widthMm: number
  heightMm: number
  characteristicSelections: {
    characteristicId: string
    subCharacteristicId: string
    pricingMode?: PricingMode
    manualUnitPrice?: number
  }[]
  discountPct?: number
  extraMarkupPct?: number
  description?: string
  pricingMode?: PricingMode
  manualUnitPrice?: number
  /** Overrides the auto-assigned "P01"/"P02"/... code. Omit/blank to keep the usual auto-numbered one (add) or leave an existing one unchanged (edit). */
  positionCode?: string
}

/**
 * Dry-run pricing result from POST .../positions/preview — same shape
 * addPosition/updatePosition compute, nothing persisted. Plain numbers
 * here (not the numeric-as-string shape a stored QuotePosition has) —
 * this never round-trips through a Postgres numeric column.
 */
export interface QuotePositionPreview {
  totalM2: number
  basePrice: number
  finalPrice: number
  discountPct: number
  extraMarkupPct: number
  lineUnitPrice: number
  /** The line's €/unit after the position's discount and markup. */
  lineFinalUnitPrice: number
  /** `lineUnitPrice` is the line's minimum (MinValue): its table/formula gave less. */
  lineMinApplied: boolean
  /** Installation hours per unit: the line's plus each chosen option's. */
  installationHours: number
  /** `price` per unit before discount/markup; `finalUnitPrice` after the discount and markup it is priced at. */
  characteristics: {
    characteristicId: string
    subCharacteristicId: string
    price: number
    discountPct: number
    markupPct: number
    finalUnitPrice: number
    /** Its price is its minimum (MinValue). */
    minApplied: boolean
  }[]
}
