export interface ProductFamily {
  id: string
  name: string
  total: number
  isValid: boolean
  validityNote?: string
  isAlternative: boolean
}

export const DEMO_FAMILIES: ProductFamily[] = [
  {
    id: '1',
    name: 'Scorrevoli Design Line',
    total: 14840,
    isValid: false,
    validityNote: 'Il prodotto non è più valido dal 02/04/2026',
    isAlternative: false,
  },
  {
    id: '2',
    name: 'Finestre Panorama',
    total: 8885.6,
    isValid: true,
    isAlternative: false,
  },
  {
    id: '3',
    name: 'Tende Tecniche',
    total: 11890,
    isValid: true,
    isAlternative: false,
  },
]

export const DEMO_TOTAL = 35615.6

/**
 * Formats a number as EUR currency matching the demo locale style.
 */
export const formatCurrency = (amount: number, locale: string): string => {
  return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : locale === 'en' ? 'en-GB' : 'it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
