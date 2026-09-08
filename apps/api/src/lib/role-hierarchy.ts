/**
 * Which roles a caller may grant when inviting a user. `super-admin` is
 * the platform operator role (cross-tenant) and is never grantable through
 * a tenant-scoped route — only reachable via a caller who is already a
 * super-admin, which bypasses this table entirely (see `canGrantRole`).
 */
const GRANTABLE_ROLES_BY_CALLER: Record<string, ReadonlySet<string>> = {
  'company-admin': new Set(['company-admin', 'super-user', 'user']),
}

/**
 * Whether `callerRoleId` may assign `targetRoleId` to an invited user.
 * A caller not listed in the table (currently just `super-admin`) can
 * grant any role — there's nothing above `super-admin` to escalate to.
 * @param callerRoleId - Role of the user performing the invite
 * @param targetRoleId - Role being assigned to the invitee
 */
export const canGrantRole = (callerRoleId: string, targetRoleId: string): boolean => {
  const grantable = GRANTABLE_ROLES_BY_CALLER[callerRoleId]
  return grantable ? grantable.has(targetRoleId) : true
}
