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
  createInvitedUser,
  getUserByEmailInCompany,
  getUserProfileByCognitoSub,
  getUserProfileById,
  listUsers,
  markInviteFailed,
  resetInvitePending,
  syncUserFromCognito,
  withRlsTransaction,
  withSystemTransaction,
  type BusinessUnitScope,
  type CreateInvitedUserInput,
  type ExistingInviteRow,
  type UserListRow,
  type UserProfile,
} from './queries/users'
export { getCompanyById } from './queries/companies'
export { filterBusinessUnitIdsByCompany } from './queries/business-units'
export { writeAuditLog, type WriteAuditLogInput } from './queries/audit'
export {
  deleteProductFamily,
  findLatestProductFamilyVersion,
  getProductFamilyDetail,
  insertCharacteristic,
  insertPricingMatrix,
  insertProductFamily,
  insertProductFamilyImage,
  insertProductLine,
  insertProductLineCharacteristic,
  listVisibleProductFamilies,
  setProductFamilyPublished,
  type InsertCharacteristicInput,
  type InsertPricingMatrixInput,
  type InsertProductFamilyImageInput,
  type InsertProductFamilyInput,
  type InsertProductLineInput,
  type ProductFamilyDetail,
  type ProductFamilySummary,
} from './queries/product-families'
export * from './schema'
