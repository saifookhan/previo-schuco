import type { AdminUserDto, RoleId, UserDto } from '@schuco/contracts'
import type { UserListRow } from '@schuco/db'

/**
 * Map a DB user row to a tenant-scoped UserDto (no cognitoSub or cross-company data).
 * @param row - User list row from database
 */
export const toUserDto = (row: UserListRow): UserDto => ({
  id: row.id,
  email: row.email,
  name: row.name,
  status: row.status,
  role: {
    id: row.role.id as RoleId,
    name: row.role.name,
  },
  businessUnits: row.businessUnits,
})

/**
 * Map a DB user row to a cross-tenant AdminUserDto.
 * @param row - User list row from database
 */
export const toAdminUserDto = (row: UserListRow): AdminUserDto => ({
  ...toUserDto(row),
  cognitoSub: row.cognitoSub,
  company: row.company,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})
