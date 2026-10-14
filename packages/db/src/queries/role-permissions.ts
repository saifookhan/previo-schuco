import { asc, sql } from 'drizzle-orm'

import type { DbLike } from '../client'
import { rolePermissions, roles } from '../schema'

export interface RoleRow {
  id: string
  name: string
  description: string
}

/** The fixed roles, in a stable order. */
export const listAllRoles = (db: DbLike): Promise<RoleRow[]> =>
  db.select({ id: roles.id, name: roles.name, description: roles.description }).from(roles).orderBy(asc(roles.id))

/** Every stored (role, permission) pair. Empty until a super-admin first saves the matrix. */
export const listRolePermissionPairs = (db: DbLike): Promise<Array<{ roleId: string; permission: string }>> =>
  db.select({ roleId: rolePermissions.roleId, permission: rolePermissions.permission }).from(rolePermissions)

/** Replaces the whole matrix in the caller's transaction (delete-all then insert). */
export const replaceRolePermissionPairs = async (
  db: DbLike,
  pairs: Array<{ roleId: string; permission: string }>,
): Promise<void> => {
  await db.delete(rolePermissions)
  if (pairs.length) {
    await db.insert(rolePermissions).values(pairs)
  }
}

/** Serializes concurrent matrix saves for the rest of the transaction (released on commit/rollback). */
export const lockRolePermissions = async (db: DbLike): Promise<void> => {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('role_permissions'))`)
}
