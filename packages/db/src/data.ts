import type { Product, ProductFamily, Quote } from './types'

export const DEMO_PRODUCTS: Product[] = [
  {
    id: 1,
    type: 'window',
    nameEn: 'Window',
    nameIt: 'Finestra',
    nameDe: 'Fenster',
    baseRate: 420,
    imageUrl: '/products/window.svg',
  },
  {
    id: 2,
    type: 'door',
    nameEn: 'Entrance Door',
    nameIt: 'Porta d\'ingresso',
    nameDe: 'Haustür',
    baseRate: 680,
    imageUrl: '/products/door.svg',
  },
  {
    id: 3,
    type: 'sliding',
    nameEn: 'Sliding System',
    nameIt: 'Scorrevole',
    nameDe: 'Schiebesystem',
    baseRate: 890,
    imageUrl: '/products/sliding.svg',
  },
  {
    id: 4,
    type: 'folding',
    nameEn: 'Folding Sliding',
    nameIt: 'Scorrevole a libro',
    nameDe: 'Faltschiebe',
    baseRate: 1120,
    imageUrl: '/products/folding.svg',
  },
]

export const DEMO_QUOTES: Quote[] = [
  {
    id: 1,
    reference: 'PRV-2026-014',
    customerName: 'Sig. Marco Rossi',
    customerEmail: 'marco.rossi@example.com',
    productType: 'sliding',
    widthMm: 2400,
    heightMm: 2200,
    glazing: 'triple',
    security: 'enhanced',
    color: 'anthracite',
    quantity: 1,
    subtotal: 35615.6,
    vatAmount: 7835.43,
    total: 43451.03,
    locale: 'it',
    createdAt: '2026-01-15T10:30:00.000Z',
  },
  {
    id: 2,
    reference: 'PRV-2026-011',
    customerName: 'Studio Architetti Milano',
    customerEmail: 'info@studioarchitetti.it',
    productType: 'window',
    widthMm: 1800,
    heightMm: 1400,
    glazing: 'double',
    security: 'standard',
    color: 'white',
    quantity: 4,
    subtotal: 22100,
    vatAmount: 4862,
    total: 26962,
    locale: 'it',
    createdAt: '2026-01-10T14:00:00.000Z',
  },
  {
    id: 3,
    reference: 'PRV-2026-009',
    customerName: 'Costruzioni Bianchi S.p.A.',
    customerEmail: 'preventivi@bianchi.it',
    productType: 'folding',
    widthMm: 4800,
    heightMm: 2400,
    glazing: 'acoustic',
    security: 'premium',
    color: 'wood',
    quantity: 2,
    subtotal: 89400,
    vatAmount: 19668,
    total: 109068,
    locale: 'it',
    createdAt: '2026-01-05T09:15:00.000Z',
  },
]

export const DEMO_PRODUCT_FAMILIES: ProductFamily[] = [
  {
    id: 1,
    quoteReference: 'PRV-2026-014',
    name: 'Scorrevoli Design Line',
    sortOrder: 0,
    total: 14840,
    isValid: false,
    validityNote: 'Il prodotto non è più valido dal 02/04/2026',
    isAlternative: false,
  },
  {
    id: 2,
    quoteReference: 'PRV-2026-014',
    name: 'Finestre Panorama',
    sortOrder: 1,
    total: 8885.6,
    isValid: true,
    validityNote: 'Il prodotto è valido',
    isAlternative: false,
  },
  {
    id: 3,
    quoteReference: 'PRV-2026-014',
    name: 'Tende Tecniche',
    sortOrder: 2,
    total: 11890,
    isValid: true,
    validityNote: 'Il prodotto è valido',
    isAlternative: false,
  },
]

/**
 * Returns a quote by reference from the static demo dataset.
 */
export const getQuoteByReference = (reference: string): Quote | undefined =>
  DEMO_QUOTES.find((quote) => quote.reference === reference)

/**
 * Returns product families for a quote reference from the static demo dataset.
 */
export const getProductFamiliesByReference = (reference: string): ProductFamily[] =>
  DEMO_PRODUCT_FAMILIES.filter((family) => family.quoteReference === reference)
    .sort((a, b) => a.sortOrder - b.sortOrder)
