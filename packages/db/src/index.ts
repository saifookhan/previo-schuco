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
  ACTIVE_DEMO_USER_EMAILS,
  DEMO_USER_SEEDS,
  type DemoBusinessUnitKey,
  type DemoCompanyKey,
  type DemoRoleId,
  type DemoUserSeed,
} from './demo-users'
export {
  getUserProfileByCognitoSub,
  listUsers,
  setRlsContext,
  syncUserFromCognito,
  type BusinessUnitScope,
  type UserListRow,
  type UserProfile,
} from './queries/users'
export * from './schema'
