import type { Permission } from '@schuco/contracts'

import type { RoleId } from '@/types/settings'

/**
 * Minimum role rank for hierarchical checks.
 */
const roleRank: Record<RoleId, number> = {
  'super-admin': 4,
  'company-admin': 3,
  'super-user': 2,
  user: 1,
}

/** Custom roles aren't in the ladder; they count as the lowest built-in level (permissions, not rank, decide what they may do). */
const rankOf = (role: RoleId): number => roleRank[role] ?? 1

/**
 * Check if user meets minimum role level.
 * @param userRole - Current user role
 * @param minimum - Minimum required role
 */
export const hasMinimumRole = (userRole: RoleId, minimum: RoleId): boolean =>
  rankOf(userRole) >= rankOf(minimum)

/** Who may open a page: a minimum role, or one permission. Same rules as the sidebar. */
export type PageAccess = { minRole: RoleId } | { permission: Permission }

/** Whether `user` (as /api/me returns it) passes `access`. */
export const canAccess = (
  user: { role: { id: RoleId }; permissions?: Permission[] },
  access: PageAccess,
): boolean =>
  'permission' in access ? (user.permissions ?? []).includes(access.permission) : hasMinimumRole(user.role.id, access.minRole)

/** Who may open each section of the app — the sidebar shows an entry only when its page lets the user in. */
export const PAGE_ACCESS = {
  '/app/dashboard': { minRole: 'user' },
  '/app/product-families': { permission: 'catalog.view' },
  '/app/quotes': { permission: 'quote.view' },
  '/app/partners': { permission: 'partners.manage' },
  '/app/settings/users': { minRole: 'company-admin' },
  '/app/settings/access-rights': { minRole: 'super-admin' },
  '/app/settings/company': { minRole: 'company-admin' },
  '/app/settings/audit-log': { minRole: 'company-admin' },
  '/admin/dashboard': { minRole: 'super-admin' },
} as const satisfies Record<string, PageAccess>

export type GuardedPath = keyof typeof PAGE_ACCESS
