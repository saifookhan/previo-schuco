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

export interface QuotePositionCharacteristic {
  id: string
  quotePositionId: string
  characteristicId: string
  subCharacteristicId: string
  characteristicName: string
  subCharacteristicName: string
  price: string
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
  characteristicSelections: { characteristicId: string; subCharacteristicId: string }[]
  discountPct?: number
  extraMarkupPct?: number
  description?: string
}
