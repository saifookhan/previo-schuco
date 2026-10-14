import type { CompanyCapabilities } from './schemas/companies'

/** Every action the API and UI gate on. */
export const PERMISSIONS = [
  'catalog.view',
  'catalog.edit',
  'quote.view',
  'quote.edit',
  'users.manage',
  'links.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/** What each role may do, regardless of which company it belongs to. */
export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
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
export const computePermissions = (roleIds: readonly string[], capabilities: CompanyCapabilities): Permission[] => {
  const fromRoles = new Set<Permission>(roleIds.flatMap((id) => ROLE_PERMISSIONS[id] ?? []))
  if (roleIds.includes('super-admin')) {
    return [...fromRoles]
  }
  const fromCapabilities = new Set<Permission>(
    (Object.keys(CAPABILITY_PERMISSIONS) as Array<keyof CompanyCapabilities>)
      .filter((key) => capabilities[key])
      .flatMap((key) => CAPABILITY_PERMISSIONS[key]),
  )
  return [...fromRoles].filter((permission) => fromCapabilities.has(permission))
}
