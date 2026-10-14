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
