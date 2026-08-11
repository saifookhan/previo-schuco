export {
  DEMO_PRODUCTS,
  DEMO_PRODUCT_FAMILIES,
  DEMO_QUOTES,
  getProductFamiliesByReference,
  getQuoteByReference,
} from './data'

export type { NewQuote, Product, ProductFamily, Quote } from './types'

export { createDb, type Db } from './client'
export { CANONICAL_ROLES, seedDatabase } from './seed'
export {
  getUserProfileByCognitoSub,
  setRlsContext,
  syncUserFromCognito,
  type BusinessUnitScope,
  type UserProfile,
} from './queries/users'
export * from './schema'
