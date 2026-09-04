export {
  DEMO_PRODUCTS,
  DEMO_PRODUCT_FAMILIES,
  DEMO_QUOTES,
  getProductFamiliesByReference,
  getQuoteByReference,
} from './data'

export type { NewQuote, Product, ProductFamily, Quote } from './types'

export { createDb, type Db, type DbLike } from './client'
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
  syncUserFromCognito,
  withRlsTransaction,
  withSystemTransaction,
  type BusinessUnitScope,
  type UserListRow,
  type UserProfile,
} from './queries/users'
export { getCompanyById } from './queries/companies'
export { writeAuditLog, type WriteAuditLogInput } from './queries/audit'
export * from './schema'
