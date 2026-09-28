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
  getUserByEmail,
  getUserByEmailInCompany,
  getUserProfileByCognitoSub,
  getUserProfileById,
  listUsers,
  markInviteFailed,
  resetInvitePending,
  setUserPassword,
  syncUserFromCognito,
  withRlsTransaction,
  withSystemTransaction,
  type BusinessUnitScope,
  type CreateInvitedUserInput,
  type ExistingInviteRow,
  type UserAuthRow,
  type UserListRow,
  type UserProfile,
} from './queries/users'
export {
  getValidAuthTokenByHash,
  insertAuthToken,
  invalidatePendingAuthTokens,
  markAuthTokenUsed,
  type InsertAuthTokenInput,
  type ValidAuthToken,
} from './queries/auth-tokens'
export {
  getCompanyById,
  insertCompany,
  listAllCompanies,
  setCompanyActive,
  updateCompany,
  type CompanyRow,
  type CompanySummary,
  type InsertCompanyInput,
  type UpdateCompanyInput,
} from './queries/companies'
export { filterBusinessUnitIdsByCompany } from './queries/business-units'
export { writeAuditLog, type WriteAuditLogInput } from './queries/audit'
export {
  deleteProductFamily,
  getProductFamiliesPublishStatus,
  getProductFamilyById,
  touchProductFamily,
  updateCharacteristic,
  updatePricingMatrix,
  updateProductLine,
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
  type CharacteristicRow,
  type InsertCharacteristicInput,
  type InsertPricingMatrixInput,
  type InsertProductFamilyImageInput,
  type InsertProductFamilyInput,
  type InsertProductLineInput,
  type PricingMatrixRow,
  type ProductFamilyDetail,
  type ProductLineRow,
  type UpdateCharacteristicInput,
  type UpdatePricingMatrixInput,
  type UpdateProductLineInput,
  type ProductFamilySummary,
} from './queries/product-families'
export {
  deleteQuotePosition,
  getQuoteDetail,
  insertQuote,
  insertQuotePosition,
  insertQuotePositionCharacteristic,
  listQuotes,
  recalculateQuoteTotal,
  reorderQuotePositions,
  type InsertQuoteInput,
  type InsertQuotePositionCharacteristicInput,
  type InsertQuotePositionInput,
  type QuoteDetail,
  type QuotePositionCharacteristicRow,
  type QuotePositionRow,
  type QuoteSummary,
} from './queries/quotes'
export * from './schema'
