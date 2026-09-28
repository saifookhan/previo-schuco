import type { CompanyDto } from '@schuco/contracts'
import type { CompanyRow } from '@schuco/db'

/** Map a DB company row to the admin-panel CompanyDto. */
export const toCompanyDto = (row: CompanyRow): CompanyDto => ({
  id: row.id,
  type: row.type,
  name: row.name,
  vatNumber: row.vatNumber,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})
