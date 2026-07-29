export type ProductType = 'window' | 'door' | 'sliding' | 'folding'

export type GlazingType = 'double' | 'triple' | 'acoustic'

export type SecurityLevel = 'standard' | 'enhanced' | 'premium'

export type ColorFinish = 'white' | 'anthracite' | 'silver' | 'wood'

export interface QuoteConfiguration {
  productType: ProductType
  widthMm: number
  heightMm: number
  glazing: GlazingType
  security: SecurityLevel
  color: ColorFinish
  quantity: number
}

export interface QuoteLineItem {
  label: string
  amount: number
}

export interface QuoteResult {
  areaSqM: number
  lineItems: QuoteLineItem[]
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  currency: 'EUR'
  feasible: boolean
  feasibilityNotes: string[]
}

const BASE_RATES: Record<ProductType, number> = {
  window: 420,
  door: 680,
  sliding: 890,
  folding: 1120,
}

const GLAZING_MULTIPLIERS: Record<GlazingType, number> = {
  double: 1,
  triple: 1.18,
  acoustic: 1.32,
}

const SECURITY_SURCHARGES: Record<SecurityLevel, number> = {
  standard: 0,
  enhanced: 85,
  premium: 195,
}

const COLOR_SURCHARGES: Record<ColorFinish, number> = {
  white: 0,
  anthracite: 45,
  silver: 55,
  wood: 120,
}

const MIN_DIMENSIONS: Record<ProductType, { minW: number; minH: number; maxW: number; maxH: number }> = {
  window: { minW: 400, minH: 500, maxW: 3000, maxH: 2800 },
  door: { minW: 700, minH: 1800, maxW: 1400, maxH: 2600 },
  sliding: { minW: 1200, minH: 1800, maxW: 6000, maxH: 2800 },
  folding: { minW: 1800, minH: 2000, maxW: 8000, maxH: 2800 },
}

/**
 * Validates whether a configuration is within Schüco technical limits.
 */
export const validateConfiguration = (config: QuoteConfiguration): string[] => {
  const notes: string[] = []
  const limits = MIN_DIMENSIONS[config.productType]

  if (config.widthMm < limits.minW || config.widthMm > limits.maxW) {
    notes.push(`Width must be between ${limits.minW}–${limits.maxW} mm`)
  }

  if (config.heightMm < limits.minH || config.heightMm > limits.maxH) {
    notes.push(`Height must be between ${limits.minH}–${limits.maxH} mm`)
  }

  if (config.quantity < 1 || config.quantity > 50) {
    notes.push('Quantity must be between 1 and 50')
  }

  return notes
}

/**
 * Calculates a quote from a product configuration using area-based pricing.
 */
export const calculateQuote = (config: QuoteConfiguration): QuoteResult => {
  const feasibilityNotes = validateConfiguration(config)
  const feasible = feasibilityNotes.length === 0

  const areaSqM = (config.widthMm * config.heightMm) / 1_000_000
  const baseRate = BASE_RATES[config.productType]
  const glazingMultiplier = GLAZING_MULTIPLIERS[config.glazing]
  const securitySurcharge = SECURITY_SURCHARGES[config.security]
  const colorSurcharge = COLOR_SURCHARGES[config.color]

  const unitBase = areaSqM * baseRate * glazingMultiplier
  const unitTotal = unitBase + securitySurcharge + colorSurcharge
  const subtotal = Math.round(unitTotal * config.quantity * 100) / 100

  const lineItems: QuoteLineItem[] = [
    {
      label: 'Base unit (area × rate)',
      amount: Math.round(unitBase * config.quantity * 100) / 100,
    },
    {
      label: 'Security upgrade',
      amount: Math.round(securitySurcharge * config.quantity * 100) / 100,
    },
    {
      label: 'Color finish',
      amount: Math.round(colorSurcharge * config.quantity * 100) / 100,
    },
  ]

  const vatRate = 0.22
  const vatAmount = Math.round(subtotal * vatRate * 100) / 100
  const total = Math.round((subtotal + vatAmount) * 100) / 100

  return {
    areaSqM: Math.round(areaSqM * 100) / 100,
    lineItems,
    subtotal,
    vatRate,
    vatAmount,
    total,
    currency: 'EUR',
    feasible,
    feasibilityNotes,
  }
}

/**
 * Generates a human-readable quote reference number.
 */
export const generateQuoteReference = (): string => {
  const year = new Date().getFullYear()
  const seq = Math.floor(Math.random() * 90000) + 10000
  return `SCH-${year}-${seq}`
}
