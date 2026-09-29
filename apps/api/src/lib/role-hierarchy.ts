/**
 * Which roles a caller may grant when inviting a user. `super-admin` is
 * handled as an explicit allow-all branch below, not a table entry — it's
 * the platform operator role (cross-tenant), and there's nothing above it
 * to escalate to.
 */
const GRANTABLE_ROLES_BY_CALLER: Record<string, ReadonlySet<string>> = {
  'company-admin': new Set(['company-admin', 'super-user', 'user']),
}

/**
 * Whether `callerRoleId` may assign `targetRoleId` to an invited user.
 * Fails closed: any `callerRoleId` not explicitly handled — including one
 * `requireRoles` might allow in the future that this table doesn't yet
 * know about — is denied, never silently granted. `super-admin` is the
 * one explicit allow-all.
 * @param callerRoleId - Role of the user performing the invite
 * @param targetRoleId - Role being assigned to the invitee
 */
export const canGrantRole = (callerRoleId: string, targetRoleId: string): boolean => {
  if (callerRoleId === 'super-admin') {
    return true
  }
  return GRANTABLE_ROLES_BY_CALLER[callerRoleId]?.has(targetRoleId) ?? false
}
