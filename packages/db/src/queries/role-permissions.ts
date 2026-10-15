import { asc, eq, sql } from 'drizzle-orm'

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

/** Creates a custom role. Returns false when the id is already taken. */
export const insertRole = async (db: DbLike, role: RoleRow): Promise<boolean> => {
  const rows = await db.insert(roles).values(role).onConflictDoNothing({ target: roles.id }).returning({ id: roles.id })
  return rows.length > 0
}

/** Deletes a role (its permission rows cascade). Returns whether it existed. Fails with an FK error while any user still holds it. */
export const deleteRoleById = async (db: DbLike, roleId: string): Promise<boolean> => {
  const rows = await db.delete(roles).where(eq(roles.id, roleId)).returning({ id: roles.id })
  return rows.length > 0
}

/** How many users hold each role, as primary or additional. Cross-tenant — call with a super-admin scope. */
export const countRoleHolders = async (db: DbLike): Promise<Map<string, number>> => {
  const rows = await db.execute<{ role_id: string; holders: number }>(sql`
    SELECT role_id, count(*)::int AS holders FROM (
      SELECT id AS user_id, role_id FROM users
      UNION ALL
      SELECT user_id, role_id FROM user_additional_roles
    ) held
    GROUP BY role_id
  `)
  return new Map(rows.map((row) => [row.role_id, Number(row.holders)]))
}
