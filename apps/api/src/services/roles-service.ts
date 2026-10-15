import { isBuiltInRole, type RoleDto } from '@schuco/contracts'
import {
  countRoleHolders,
  deleteRoleById,
  insertRole,
  listAllRoles,
  listRolePermissionPairs,
  lockRolePermissions,
  sortRolesByRank,
} from '@schuco/db'

import { PG_FOREIGN_KEY_VIOLATION, pgErrorCode } from '../lib/pg-error'
import { canGrantByPermissions, canGrantRoles } from '../lib/role-hierarchy'
import { withTenantDb, type TenantContext } from '../lib/tenant-db'
import { recordAuditEvent } from './audit-service'
import { getEffectiveRolePermissions, invalidateRolePermissionsCache } from './role-permissions-service'

/** The requested role breaks a rule (blank/duplicate name, built-in id). */
export class RoleValidationError extends Error {}

/** The role to delete doesn't exist. */
export class RoleNotFoundError extends Error {}

/** The role can't be deleted: built-in, or still held by users. */
export class RoleInUseError extends Error {}

export interface RoleActor {
  actorUserId: string
  actorCompanyId: string
  requestId?: string | null
}

const auditActor = (actor: RoleActor) => ({
  actorType: 'user' as const,
  actorUserId: actor.actorUserId,
  actorCompanyId: actor.actorCompanyId,
  requestId: actor.requestId,
})

/** "Project Manager" → "project-manager". Empty if the name has no letters or digits. */
export const roleSlug = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '')

/** Every role with its holder count (super-admin view; built-in roles first). */
export const listRolesWithCounts = (ctx: TenantContext): Promise<RoleDto[]> =>
  withTenantDb(ctx, async (tx) => {
    const [rows, holders] = await Promise.all([listAllRoles(tx), countRoleHolders(tx)])
    return sortRolesByRank(rows).map((role) => ({
      ...role,
      builtIn: isBuiltInRole(role.id),
      userCount: holders.get(role.id) ?? 0,
    }))
  })

/** The roles this caller may actually give a new user — the same rules the invite itself enforces. */
export const listGrantableRoles = async (ctx: TenantContext, callerRoleIds: string[]) => {
  const [all, matrix] = await Promise.all([withTenantDb(ctx, (tx) => listAllRoles(tx)), getEffectiveRolePermissions()])
  return sortRolesByRank(all).filter(
    (role) => canGrantRoles(callerRoleIds, [role.id]) && canGrantByPermissions(callerRoleIds, [role.id], matrix),
  )
}

/**
 * Creates a custom role. It starts with no permissions — grant them in the
 * access-rights matrix.
 * @throws {RoleValidationError} no usable name, or a role with that id already exists
 */
export const createRole = async (
  ctx: TenantContext,
  actor: RoleActor,
  input: { name: string; description?: string },
): Promise<RoleDto> => {
  const id = roleSlug(input.name)
  if (!id) {
    throw new RoleValidationError('Role name needs at least one letter or digit')
  }
  // An empty description is shown as the localized "Custom role" in the UI, so no English string is stored.
  const role = { id, name: input.name.trim(), description: input.description?.trim() ?? '' }
  await withTenantDb(ctx, async (tx) => {
    await lockRolePermissions(tx)
    if (!(await insertRole(tx, role))) {
      throw new RoleValidationError(`A role named '${role.name}' (id '${id}') already exists`)
    }
    await recordAuditEvent(tx, auditActor(actor), actor.actorCompanyId, {
      action: 'role.create',
      resourceType: 'role',
      resourceId: id,
      metadata: { name: role.name },
    })
  })
  invalidateRolePermissionsCache()
  return { ...role, builtIn: false, userCount: 0 }
}

/**
 * Deletes a custom role (and its permission rows).
 * @throws {RoleNotFoundError} unknown role
 * @throws {RoleInUseError} built-in role, or users still hold it
 */
export const deleteRole = async (ctx: TenantContext, actor: RoleActor, roleId: string): Promise<void> => {
  if (isBuiltInRole(roleId)) {
    throw new RoleInUseError('Built-in roles cannot be deleted')
  }
  await withTenantDb(ctx, async (tx) => {
    await lockRolePermissions(tx) // serialize with matrix saves, which write rows for every role
    const [holders, roleRows, pairs] = await Promise.all([
      countRoleHolders(tx),
      listAllRoles(tx),
      listRolePermissionPairs(tx),
    ])
    if ((holders.get(roleId) ?? 0) > 0) {
      throw new RoleInUseError('Users still have this role — remove it from them first')
    }
    const existing = roleRows.find((role) => role.id === roleId)
    let deleted = false
    try {
      deleted = await deleteRoleById(tx, roleId)
    } catch (error) {
      // A user was given the role after the count above — the foreign key caught it.
      if (pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION) {
        throw new RoleInUseError('Users still have this role — remove it from them first')
      }
      throw error
    }
    if (!deleted) {
      throw new RoleNotFoundError(`Role '${roleId}' not found`)
    }
    await recordAuditEvent(tx, auditActor(actor), actor.actorCompanyId, {
      action: 'role.delete',
      resourceType: 'role',
      resourceId: roleId,
      metadata: {
        name: existing?.name,
        description: existing?.description,
        permissions: pairs.filter((pair) => pair.roleId === roleId).map((pair) => pair.permission),
      },
    })
  })
  invalidateRolePermissionsCache()
}
