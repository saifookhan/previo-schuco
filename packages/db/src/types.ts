export interface Product {
  id: number
  type: string
  nameEn: string
  nameIt: string
  nameDe: string
  baseRate: number
  imageUrl: string | null
}

export interface Quote {
  id: number
  reference: string
  customerName: string
  customerEmail: string | null
  productType: string
  widthMm: number
  heightMm: number
  glazing: string
  security: string
  color: string
  quantity: number
  subtotal: number
  vatAmount: number
  total: number
  locale: string
  createdAt: string
}

export interface ProductFamily {
  id: number
  quoteReference: string
  name: string
  sortOrder: number
  total: number
  isValid: boolean
  validityNote: string | null
  isAlternative: boolean
}

export type NewQuote = Omit<Quote, 'id'>
