import {
  IMPLIED_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  permissionLock,
  type Permission,
  type RolePermissionMatrix,
  type RolePermissionsResponse,
} from '@schuco/contracts'
import {
  listAllRoles,
  listRolePermissionPairs,
  lockRolePermissions,
  replaceRolePermissionPairs,
  withSystemTransaction,
} from '@schuco/db'

import { getDb } from '../lib/db'
import { withTenantDb, type TenantContext } from '../lib/tenant-db'
import { recordAuditEvent } from './audit-service'

/** The submitted matrix breaks a rule (unknown/missing role, locked permission, etc.). */
export class RolePermissionsValidationError extends Error {}

export interface RolePermissionsActor {
  actorUserId: string
  actorCompanyId: string
  requestId?: string | null
}

interface LoadedMatrix {
  matrix: RolePermissionMatrix
  isDefault: boolean
}

// Short TTL because every protected request needs the matrix. A save in THIS process invalidates
// immediately; other API processes pick it up within the TTL (there is one API process today).
const CACHE_TTL_MS = 5_000
let cache: (LoadedMatrix & { loadedAt: number }) | null = null
let inflight: Promise<RolePermissionMatrix> | null = null
// Bumped by every invalidation so a load that started before a save can't write its stale result back.
let generation = 0

/** Drops the in-process cache so the next request re-reads the table. */
export const invalidateRolePermissionsCache = (): void => {
  generation += 1
  cache = null
  inflight = null
}

const buildMatrix = (pairs: Array<{ roleId: string; permission: string }>): LoadedMatrix => {
  if (pairs.length === 0) {
    return { matrix: ROLE_PERMISSIONS, isDefault: true }
  }
  const known = new Set<string>(PERMISSIONS)
  const matrix: Record<string, Permission[]> = {}
  for (const { roleId, permission } of pairs) {
    if (known.has(permission)) {
      ;(matrix[roleId] ??= []).push(permission as Permission)
    }
  }
  return { matrix, isDefault: false }
}

/**
 * The role → permissions matrix in force: the saved one, or the built-in
 * defaults while none has been saved. Concurrent cache misses share one
 * load; if the database read fails, the last good matrix keeps being served
 * rather than turning every protected request into a 500.
 */
export const getEffectiveRolePermissions = async (): Promise<RolePermissionMatrix> => {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.matrix
  }
  if (!inflight) {
    const startedAt = generation
    inflight = withSystemTransaction(getDb(), (tx) => listRolePermissionPairs(tx))
      .then((pairs) => {
        const loaded = buildMatrix(pairs)
        if (startedAt === generation) {
          cache = { ...loaded, loadedAt: Date.now() }
        }
        return loaded.matrix
      })
      .catch((error: unknown) => {
        if (cache) {
          return cache.matrix
        }
        throw error
      })
      .finally(() => {
        if (startedAt === generation) {
          inflight = null
        }
      })
  }
  return inflight
}

/** The matrix plus the role/permission lists needed to render the editor (super-admin). */
export const getRolePermissionsView = async (ctx: TenantContext): Promise<RolePermissionsResponse> =>
  withTenantDb(ctx, async (tx) => {
    const [roleRows, pairs] = await Promise.all([listAllRoles(tx), listRolePermissionPairs(tx)])
    const { matrix, isDefault } = buildMatrix(pairs)
    return {
      permissions: [...PERMISSIONS],
      roles: roleRows,
      matrix: Object.fromEntries(roleRows.map((role) => [role.id, [...(matrix[role.id] ?? [])]])),
      isDefault,
    }
  })

/**
 * Saves the complete matrix and returns it as saved. Rules: every role must be
 * present and known; locked cells (see `permissionLock`) must hold their forced
 * value (super-admin's own row is ignored and always full); and wherever a role
 * can edit something it must also be able to view it.
 * @throws {RolePermissionsValidationError} a rule above is broken
 */
export const updateRolePermissions = async (
  ctx: TenantContext,
  actor: RolePermissionsActor,
  submitted: Record<string, readonly Permission[]>,
): Promise<RolePermissionsResponse> => {
  const view = await withTenantDb(ctx, async (tx) => {
    await lockRolePermissions(tx) // serialize concurrent saves; released on commit

    const roleRows = await listAllRoles(tx)
    const roleIds = new Set(roleRows.map((r) => r.id))

    for (const id of Object.keys(submitted)) {
      if (!roleIds.has(id)) {
        throw new RolePermissionsValidationError(`Unknown role '${id}'`)
      }
    }
    for (const id of roleIds) {
      if (!(id in submitted)) {
        throw new RolePermissionsValidationError(`Missing role '${id}'`)
      }
    }

    const next: Record<string, Permission[]> = {}
    for (const id of roleIds) {
      next[id] = id === 'super-admin' ? [...PERMISSIONS] : [...new Set(submitted[id])]
    }

    for (const [id, granted] of Object.entries(next)) {
      if (id === 'super-admin') {
        continue
      }
      for (const permission of PERMISSIONS) {
        const lock = permissionLock(id, permission)
        if (lock === 'company-admin-users' && !granted.includes(permission)) {
          throw new RolePermissionsValidationError(`'${id}' must keep '${permission}'`)
        }
      }
      for (const [edit, view] of IMPLIED_PERMISSIONS) {
        if (granted.includes(edit) && !granted.includes(view)) {
          throw new RolePermissionsValidationError(`'${id}' has '${edit}' but not '${view}'`)
        }
      }
    }

    const before = buildMatrix(await listRolePermissionPairs(tx))
    await replaceRolePermissionPairs(
      tx,
      Object.entries(next).flatMap(([roleId, granted]) => granted.map((permission) => ({ roleId, permission }))),
    )
    await recordAuditEvent(
      tx,
      {
        actorType: 'user',
        actorUserId: actor.actorUserId,
        actorCompanyId: actor.actorCompanyId,
        requestId: actor.requestId,
      },
      actor.actorCompanyId,
      {
        action: 'role_permissions.update',
        resourceType: 'role_permissions',
        resourceId: 'global',
        metadata: { before: before.matrix, after: next },
      },
    )
    return { permissions: [...PERMISSIONS], roles: roleRows, matrix: next, isDefault: false }
  })
  invalidateRolePermissionsCache()
  return view
}
