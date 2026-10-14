import type { CompanyCapabilities } from './schemas/companies'

/**
 * Every action the API and UI gate on. Once a super-admin has saved a custom
 * matrix, the database is the source of truth — so a permission added here
 * later must ship with a migration that inserts its default grants.
 */
export const PERMISSIONS = [
  'catalog.view',
  'catalog.edit',
  'quote.view',
  'quote.edit',
  'users.manage',
  'links.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/** Which permission set each role grants (role id → permissions). */
export type RolePermissionMatrix = Record<string, readonly Permission[]>

/** Permissions that may only ever belong to super-admin (cross-tenant). */
export const SUPER_ADMIN_ONLY_PERMISSIONS: readonly Permission[] = ['links.manage']

/** Default role → permissions, used until a super-admin saves a custom matrix. */
export const ROLE_PERMISSIONS: RolePermissionMatrix = {
  'super-admin': PERMISSIONS,
  'company-admin': ['catalog.view', 'catalog.edit', 'quote.view', 'quote.edit', 'users.manage'],
  'super-user': ['catalog.view', 'catalog.edit', 'quote.view', 'quote.edit'],
  user: ['catalog.view', 'quote.view', 'quote.edit'],
}

/**
 * What each company capability unlocks. A permission is effective only if
 * a role grants it AND the user's company has a capability that unlocks it.
 * Manufacturers own and edit a catalog; suppliers browse linked
 * manufacturers' published catalogs and quote from them; clients only
 * browse. Writes mirror the database RLS (catalog writes need manufacturer,
 * quote writes need supplier) — keep them in sync.
 */
export const CAPABILITY_PERMISSIONS: Record<keyof CompanyCapabilities, readonly Permission[]> = {
  platform: ['catalog.view', 'quote.view', 'users.manage', 'links.manage'],
  manufacturer: ['catalog.view', 'catalog.edit', 'users.manage'],
  supplier: ['catalog.view', 'quote.view', 'quote.edit', 'users.manage'],
  client: ['catalog.view', 'users.manage'],
}

/**
 * Effective permissions = (union of the user's roles' permissions) ∩
 * (union of the company's capabilities' permissions). Super-admin is
 * cross-tenant and bypasses the capability filter.
 */
export const computePermissions = (
  roleIds: readonly string[],
  capabilities: CompanyCapabilities,
  matrix: RolePermissionMatrix = ROLE_PERMISSIONS,
): Permission[] => {
  const fromRoles = new Set<Permission>(roleIds.flatMap((id) => matrix[id] ?? []))
  if (roleIds.includes('super-admin')) {
    return [...PERMISSIONS] // super-admin is cross-tenant and always holds everything, whatever the matrix says
  }
  const fromCapabilities = new Set<Permission>(
    (Object.keys(CAPABILITY_PERMISSIONS) as Array<keyof CompanyCapabilities>)
      .filter((key) => capabilities[key])
      .flatMap((key) => CAPABILITY_PERMISSIONS[key]),
  )
  return [...fromRoles].filter((permission) => fromCapabilities.has(permission))
}

export type PermissionLock = 'super-admin' | 'super-admin-only' | 'company-admin-users'

/**
 * Cells of the role × permission matrix that cannot be changed, and why.
 * Shared by the API's validation and the editor UI so they never disagree.
 * - super-admin always holds everything
 * - super-admin-only permissions never belong to another role
 * - company-admin always keeps `users.manage` (a company can't lock itself out)
 */
export const permissionLock = (roleId: string, permission: Permission): PermissionLock | null => {
  if (roleId === 'super-admin') {
    return 'super-admin'
  }
  if (SUPER_ADMIN_ONLY_PERMISSIONS.includes(permission)) {
    return 'super-admin-only'
  }
  if (roleId === 'company-admin' && permission === 'users.manage') {
    return 'company-admin-users'
  }
  return null
}

/** `edit` is useless (and surprising) without `view`: the matrix must grant view wherever it grants edit. */
export const IMPLIED_PERMISSIONS: ReadonlyArray<readonly [Permission, Permission]> = [
  ['catalog.edit', 'catalog.view'],
  ['quote.edit', 'quote.view'],
]
