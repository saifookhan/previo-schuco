process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { computePermissions, PERMISSIONS, ROLE_PERMISSIONS, type Permission } from '@schuco/contracts'
import {
  auditLog,
  companies,
  createDb,
  rolePermissions,
  roles,
  users,
  withSystemTransaction,
  type Db,
} from '@schuco/db'

import { getDb } from '../src/lib/db'
import {
  RolePermissionsValidationError,
  getEffectiveRolePermissions,
  getRolePermissionsView,
  invalidateRolePermissionsCache,
  updateRolePermissions,
} from '../src/services/role-permissions-service'

/** Service-layer test for the global role → permission matrix. */

const ROLE_IDS = ['super-admin', 'company-admin', 'super-user', 'user']
let db: Db
let platformId: string
const superAdminCtx = { effectiveCompanyId: '', isSuperAdmin: true }
const actor = { actorUserId: '', actorCompanyId: '' }

const defaults = (): Record<string, Permission[]> =>
  Object.fromEntries(ROLE_IDS.map((id) => [id, [...(ROLE_PERMISSIONS[id] ?? [])]]))

const clearMatrix = () => withSystemTransaction(db, (tx) => tx.delete(rolePermissions))

beforeAll(async () => {
  db = getDb()
  await withSystemTransaction(db, async (tx) => {
    await tx
      .insert(roles)
      .values(ROLE_IDS.map((id) => ({ id, name: id, description: 'test role' })))
      .onConflictDoNothing({ target: roles.id })
    const [platform] = await tx
      .insert(companies)
      .values({ isPlatform: true, name: 'RolePerm Test Platform', vatNumber: 'RPERM-PLAT' })
      .returning({ id: companies.id })
    platformId = platform.id
    superAdminCtx.effectiveCompanyId = platform.id
    actor.actorCompanyId = platform.id
    const [user] = await tx
      .insert(users)
      .values({
        cognitoSub: 'rperm-test-super-admin',
        email: 'rperm-test-super-admin@example.com',
        companyId: platform.id,
        roleId: 'company-admin',
        status: 'active',
      })
      .returning({ id: users.id })
    actor.actorUserId = user.id
  })
  await clearMatrix()
  invalidateRolePermissionsCache()
})

afterAll(async () => {
  await clearMatrix()
  invalidateRolePermissionsCache()
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  await createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
    .delete(auditLog)
    .where(eq(auditLog.effectiveCompanyId, platformId))
  await withSystemTransaction(db, async (tx) => {
    await tx.delete(users).where(inArray(users.companyId, [platformId]))
    await tx.delete(companies).where(eq(companies.id, platformId))
  })
})

describe('role permission matrix', () => {
  it('uses the built-in defaults until a matrix is saved', async () => {
    const view = await getRolePermissionsView(superAdminCtx)
    expect(view.isDefault).toBe(true)
    expect(view.matrix['company-admin']).toContain('catalog.edit')
    expect(await getEffectiveRolePermissions()).toBe(ROLE_PERMISSIONS)
  })

  it('saves a custom matrix, which then drives computePermissions, and audits the change', async () => {
    const next = defaults()
    next['super-user'] = next['super-user'].filter((p) => p !== 'catalog.edit')
    next.user = [...next.user, 'catalog.edit']
    await updateRolePermissions(superAdminCtx, actor, next)

    const view = await getRolePermissionsView(superAdminCtx)
    expect(view.isDefault).toBe(false)
    expect(view.matrix['super-user']).not.toContain('catalog.edit')
    expect(view.matrix.user).toContain('catalog.edit')

    const matrix = await getEffectiveRolePermissions() // cache was invalidated by the save
    const manufacturer = { platform: false, manufacturer: true, supplier: false, client: false }
    expect(computePermissions(['user'], manufacturer, matrix)).toContain('catalog.edit')
    expect(computePermissions(['super-user'], manufacturer, matrix)).not.toContain('catalog.edit')
    expect(computePermissions(['super-admin'], manufacturer, matrix)).toEqual([...PERMISSIONS])

    const audit = await withSystemTransaction(db, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.action, 'role_permissions.update')),
    )
    expect(audit.some((row) => row.effectiveCompanyId === platformId)).toBe(true)
  })

  it('always keeps every permission for super-admin, whatever is submitted', async () => {
    const next = defaults()
    next['super-admin'] = []
    await updateRolePermissions(superAdminCtx, actor, next)
    const view = await getRolePermissionsView(superAdminCtx)
    expect([...view.matrix['super-admin']].sort()).toEqual([...PERMISSIONS].sort())
  })

  it('rejects unknown/missing roles, a company-admin without users.manage, and super-admin-only permissions on other roles', async () => {
    const withUnknown = { ...defaults(), ghost: ['catalog.view' as Permission] }
    await expect(updateRolePermissions(superAdminCtx, actor, withUnknown)).rejects.toThrow(RolePermissionsValidationError)

    const { user: _omitted, ...missingUser } = defaults()
    await expect(updateRolePermissions(superAdminCtx, actor, missingUser)).rejects.toThrow(RolePermissionsValidationError)

    const noUsersManage = defaults()
    noUsersManage['company-admin'] = noUsersManage['company-admin'].filter((p) => p !== 'users.manage')
    await expect(updateRolePermissions(superAdminCtx, actor, noUsersManage)).rejects.toThrow(RolePermissionsValidationError)

    const linksToUser = defaults()
    linksToUser.user = [...linksToUser.user, 'links.manage']
    await expect(updateRolePermissions(superAdminCtx, actor, linksToUser)).rejects.toThrow(RolePermissionsValidationError)
  })

  it('rejects a role that can edit something it cannot view', async () => {
    const editWithoutView = defaults()
    editWithoutView['super-user'] = editWithoutView['super-user'].filter((p) => p !== 'quote.view')
    await expect(updateRolePermissions(superAdminCtx, actor, editWithoutView)).rejects.toThrow(
      /quote\.edit.*quote\.view/,
    )
  })

  it('serves the saved matrix immediately after a save (cache invalidated) and returns it from the save call', async () => {
    const next = defaults()
    next.user = next.user.filter((p) => p !== 'quote.edit')
    const saved = await updateRolePermissions(superAdminCtx, actor, next)
    expect(saved.isDefault).toBe(false)
    expect(saved.matrix.user).not.toContain('quote.edit')
    expect((await getEffectiveRolePermissions()).user).not.toContain('quote.edit')
  })
})
