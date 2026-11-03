import type { CompanyCapabilities } from './schemas/companies'

/**
 * Every action the API and UI gate on. Once a super-admin has saved a custom
 * matrix, the database is the source of truth — so a permission added here
 * later must ship with a migration that inserts its default grants.
 */
export const PERMISSIONS = [
  'catalog.view',
  'catalog.edit',
  'catalog.share',
  'quote.view',
  'quote.edit',
  'users.manage',
  'partners.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/** Which permission set each role grants (role id → permissions). */
export type RolePermissionMatrix = Record<string, readonly Permission[]>

/** Default role → permissions, used until a super-admin saves a custom matrix. */
export const ROLE_PERMISSIONS: RolePermissionMatrix = {
  'super-admin': PERMISSIONS,
  'company-admin': ['catalog.view', 'catalog.edit', 'catalog.share', 'quote.view', 'quote.edit', 'users.manage', 'partners.manage'],
  'super-user': ['catalog.view', 'catalog.edit', 'catalog.share', 'quote.view', 'quote.edit', 'partners.manage'],
  user: ['catalog.view', 'quote.view', 'quote.edit'],
}

/**
 * What each company capability unlocks. A permission is effective only if
 * a role grants it AND the user's company has a capability that unlocks it.
 * Manufacturers own, edit and share product families; suppliers browse
 * the families shared with them, quote from them and may share them onward;
 * clients only browse. Every kind of company manages its own partner
 * connections. Writes mirror the database RLS (catalog writes need manufacturer,
 * quote writes need supplier) — keep them in sync.
 */
export const CAPABILITY_PERMISSIONS: Record<keyof CompanyCapabilities, readonly Permission[]> = {
  platform: ['catalog.view', 'quote.view', 'users.manage', 'partners.manage'],
  manufacturer: ['catalog.view', 'catalog.edit', 'catalog.share', 'users.manage', 'partners.manage'],
  supplier: ['catalog.view', 'catalog.share', 'quote.view', 'quote.edit', 'users.manage', 'partners.manage'],
  client: ['catalog.view', 'users.manage', 'partners.manage'],
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

export type PermissionLock = 'super-admin' | 'company-admin-users'

/**
 * Cells of the role × permission matrix that cannot be changed, and why.
 * Shared by the API's validation and the editor UI so they never disagree.
 * - super-admin always holds everything
 * - company-admin always keeps `users.manage` (a company can't lock itself out)
 */
export const permissionLock = (roleId: string, permission: Permission): PermissionLock | null => {
  if (roleId === 'super-admin') {
    return 'super-admin'
  }
  if (roleId === 'company-admin' && permission === 'users.manage') {
    return 'company-admin-users'
  }
  return null
}

/** `edit` is useless (and surprising) without `view`: the matrix must grant view wherever it grants edit. */
export const IMPLIED_PERMISSIONS: ReadonlyArray<readonly [Permission, Permission]> = [
  ['catalog.edit', 'catalog.view'],
  ['catalog.share', 'catalog.view'],
  ['quote.edit', 'quote.view'],
]
