process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, companies, createDb, roles, users, withSystemTransaction, type Db } from '@schuco/db'

import { getDb } from '../src/lib/db'
import { canGrantRoles } from '../src/lib/role-hierarchy'
import { getRolePermissionsView, invalidateRolePermissionsCache } from '../src/services/role-permissions-service'
import {
  RoleInUseError,
  RoleNotFoundError,
  RoleValidationError,
  createRole,
  deleteRole,
  listGrantableRoles,
  listRolesWithCounts,
  roleSlug,
} from '../src/services/roles-service'

/** Service-layer test: real (DB-backed) custom roles. */

let db: Db
let platformId: string
let holderUserId: string
const ctx = { effectiveCompanyId: '', isSuperAdmin: true }
const actor = { actorUserId: '', actorCompanyId: '' }
const createdRoleIds: string[] = []

beforeAll(async () => {
  db = getDb()
  await withSystemTransaction(db, async (tx) => {
    await tx
      .insert(roles)
      .values(
        ['super-admin', 'company-admin', 'super-user', 'user'].map((id) => ({ id, name: id, description: 'test role' })),
      )
      .onConflictDoNothing({ target: roles.id })
    const [platform] = await tx
      .insert(companies)
      .values({ isPlatform: true, name: 'Roles Test Platform', vatNumber: 'ROLES-PLAT' })
      .returning({ id: companies.id })
    platformId = platform.id
    ctx.effectiveCompanyId = platform.id
    actor.actorCompanyId = platform.id
    const [user] = await tx
      .insert(users)
      .values({
        cognitoSub: 'roles-test-user',
        email: 'roles-test-user@example.com',
        companyId: platform.id,
        roleId: 'company-admin',
        status: 'active',
      })
      .returning({ id: users.id })
    holderUserId = user.id
    actor.actorUserId = user.id
  })
})

afterAll(async () => {
  invalidateRolePermissionsCache()
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  await createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
    .delete(auditLog)
    .where(eq(auditLog.effectiveCompanyId, platformId))
  await withSystemTransaction(db, async (tx) => {
    await tx.delete(users).where(eq(users.companyId, platformId))
    await tx.delete(companies).where(eq(companies.id, platformId))
    if (createdRoleIds.length) {
      await tx.delete(roles).where(inArray(roles.id, createdRoleIds))
    }
  })
})

describe('roleSlug', () => {
  it('turns a name into a safe id', () => {
    expect(roleSlug('Project Manager')).toBe('project-manager')
    expect(roleSlug('  Café  Lead!! ')).toBe('cafe-lead')
    expect(roleSlug('!!!')).toBe('')
  })
})

describe('custom roles', () => {
  it('creates a role that has no permissions yet and shows up in the matrix and the grantable list', async () => {
    const role = await createRole(ctx, actor, { name: 'Rt Project Manager', description: 'Runs projects' })
    createdRoleIds.push(role.id)
    expect(role).toMatchObject({ id: 'rt-project-manager', builtIn: false, userCount: 0, description: 'Runs projects' })

    const listed = await listRolesWithCounts(ctx)
    expect(listed.find((r) => r.id === role.id)?.builtIn).toBe(false)
    expect(listed.find((r) => r.id === 'company-admin')?.builtIn).toBe(true)
    // built-in roles come first, custom roles after
    expect(listed.findIndex((r) => r.id === role.id)).toBeGreaterThan(listed.findIndex((r) => r.id === 'user'))

    const matrix = await getRolePermissionsView(ctx)
    expect(matrix.roles.map((r) => r.id)).toContain(role.id)
    expect(matrix.matrix[role.id]).toEqual([])

    const grantable = (await listGrantableRoles(ctx, ['company-admin'])).map((r) => r.id)
    expect(grantable).toContain(role.id)
    expect(grantable).not.toContain('super-admin')
    expect((await listGrantableRoles(ctx, ['super-admin'])).map((r) => r.id)).toContain('super-admin')
    expect(await listGrantableRoles(ctx, ['user'])).toEqual([]) // a plain user can't grant anything
  })

  it('stores no English description when none is given (the UI shows the localized one)', async () => {
    const role = await createRole(ctx, actor, { name: 'Rt No Description' })
    createdRoleIds.push(role.id)
    expect(role.description).toBe('')
  })

  it('rejects a blank name, a duplicate name, and a name that collides with a built-in role', async () => {
    await expect(createRole(ctx, actor, { name: '***' })).rejects.toThrow(RoleValidationError)
    await expect(createRole(ctx, actor, { name: 'rt PROJECT manager' })).rejects.toThrow(RoleValidationError)
    await expect(createRole(ctx, actor, { name: 'User' })).rejects.toThrow(RoleValidationError)
  })

  it('lets a company-admin grant a custom role, but never super-admin', () => {
    expect(canGrantRoles(['company-admin'], ['rt-project-manager', 'user'])).toBe(true)
    expect(canGrantRoles(['company-admin'], ['super-admin'])).toBe(false)
    expect(canGrantRoles(['super-user'], ['user'])).toBe(false)
  })

  it('refuses to delete a built-in role or one that users still hold, then deletes an unused one', async () => {
    await expect(deleteRole(ctx, actor, 'user')).rejects.toThrow(RoleInUseError)

    const held = await createRole(ctx, actor, { name: 'Rt Held Role' })
    createdRoleIds.push(held.id)
    await withSystemTransaction(db, (tx) => tx.update(users).set({ roleId: held.id }).where(eq(users.id, holderUserId)))
    expect((await listRolesWithCounts(ctx)).find((r) => r.id === held.id)?.userCount).toBe(1)
    await expect(deleteRole(ctx, actor, held.id)).rejects.toThrow(RoleInUseError)
    await withSystemTransaction(db, (tx) =>
      tx.update(users).set({ roleId: 'company-admin' }).where(eq(users.id, holderUserId)),
    )

    await deleteRole(ctx, actor, held.id)
    expect((await listRolesWithCounts(ctx)).some((r) => r.id === held.id)).toBe(false)
    await expect(deleteRole(ctx, actor, held.id)).rejects.toThrow(RoleNotFoundError)
  })
})
