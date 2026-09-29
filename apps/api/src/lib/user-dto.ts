import type { AdminUserDto, RoleId, UserDto } from '@schuco/contracts'
import type { UserListRow, UserProfile } from '@schuco/db'

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
 * Map a freshly-created/loaded user profile (e.g. from an invite) to a
 * UserDto — same shape as `toUserDto`, but `UserProfile` (no
 * createdAt/updatedAt) rather than the list query's `UserListRow`.
 * @param profile - User profile
 */
export const profileToUserDto = (profile: UserProfile): UserDto => ({
  id: profile.id,
  email: profile.email,
  name: profile.name,
  status: profile.status,
  role: {
    id: profile.role.id as RoleId,
    name: profile.role.name,
  },
  businessUnits: profile.businessUnits,
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
