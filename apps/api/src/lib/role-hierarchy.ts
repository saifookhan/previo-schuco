import type { RolePermissionMatrix } from '@schuco/contracts'

/**
 * Whether `callerRoleId` may assign `targetRoleId` to an invited user.
 * `super-admin` may grant anything. A `company-admin` may grant any role
 * except `super-admin` — the platform operator role (cross-tenant), and
 * custom roles carry only the permissions the matrix gives them. Every
 * other caller role is denied (fails closed).
 * @param callerRoleId - Role of the user performing the invite
 * @param targetRoleId - Role being assigned to the invitee
 */
export const canGrantRole = (callerRoleId: string, targetRoleId: string): boolean => {
  if (callerRoleId === 'super-admin') {
    return true
  }
  return callerRoleId === 'company-admin' && targetRoleId !== 'super-admin'
}

/**
 * A non-super-admin may only hand out roles whose permissions they themselves
 * hold (taken across all their roles) — otherwise a custom role with extra
 * permissions would be a way to escalate. Super-admin is unrestricted.
 * @param callerRoleIds - All roles of the user performing the invite
 * @param targetRoleIds - Roles being assigned
 * @param matrix - The role → permissions matrix in force
 */
export const canGrantByPermissions = (
  callerRoleIds: string[],
  targetRoleIds: string[],
  matrix: RolePermissionMatrix,
): boolean => {
  if (callerRoleIds.includes('super-admin')) {
    return true
  }
  const callerPermissions = new Set(callerRoleIds.flatMap((id) => matrix[id] ?? []))
  return targetRoleIds.every((target) => (matrix[target] ?? []).every((permission) => callerPermissions.has(permission)))
}

/**
 * Multi-role version: every role being assigned must be grantable by at
 * least one of the caller's roles. An empty target list is never grantable
 * (a user always needs at least one role).
 * @param callerRoleIds - All roles of the user performing the invite
 * @param targetRoleIds - Roles being assigned to the invitee
 */
export const canGrantRoles = (callerRoleIds: string[], targetRoleIds: string[]): boolean =>
  targetRoleIds.length > 0 &&
  targetRoleIds.every((target) => callerRoleIds.some((caller) => canGrantRole(caller, target)))
