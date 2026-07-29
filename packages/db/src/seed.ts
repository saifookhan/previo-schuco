import { createDb } from './index'
import { productFamilies, products, quotes } from './schema'

const db = createDb()

const seedProducts = [
  {
    type: 'window',
    nameEn: 'Window',
    nameIt: 'Finestra',
    nameDe: 'Fenster',
    baseRate: 420,
    imageUrl: '/products/window.svg',
  },
  {
    type: 'door',
    nameEn: 'Entrance Door',
    nameIt: 'Porta d\'ingresso',
    nameDe: 'Haustür',
    baseRate: 680,
    imageUrl: '/products/door.svg',
  },
  {
    type: 'sliding',
    nameEn: 'Sliding System',
    nameIt: 'Scorrevole',
    nameDe: 'Schiebesystem',
    baseRate: 890,
    imageUrl: '/products/sliding.svg',
  },
  {
    type: 'folding',
    nameEn: 'Folding Sliding',
    nameIt: 'Scorrevole a libro',
    nameDe: 'Faltschiebe',
    baseRate: 1120,
    imageUrl: '/products/folding.svg',
  },
]

for (const product of seedProducts) {
  db.insert(products).values(product).onConflictDoNothing().run()
}

const demoQuote = {
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
  createdAt: new Date().toISOString(),
}

db.insert(quotes).values(demoQuote).onConflictDoNothing().run()

const demoFamilies = [
  {
    quoteReference: 'PRV-2026-014',
    name: 'Scorrevoli Design Line',
    sortOrder: 0,
    total: 14840,
    isValid: false,
    validityNote: 'Il prodotto non è più valido dal 02/04/2026',
    isAlternative: false,
  },
  {
    quoteReference: 'PRV-2026-014',
    name: 'Finestre Panorama',
    sortOrder: 1,
    total: 8885.6,
    isValid: true,
    validityNote: 'Il prodotto è valido',
    isAlternative: false,
  },
  {
    quoteReference: 'PRV-2026-014',
    name: 'Tende Tecniche',
    sortOrder: 2,
    total: 11890,
    isValid: true,
    validityNote: 'Il prodotto è valido',
    isAlternative: false,
  },
]

for (const family of demoFamilies) {
  db.insert(productFamilies).values(family).run()
}

console.log('Database seeded')
