process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, companies, createDb, roles, users, withSystemTransaction, type Db } from '@schuco/db'

import { getDb } from '../src/lib/db'
import {
  RoleNotGrantableError,
  UserNotFoundError,
  UserUpdateRejectedError,
  updateCompanyUser,
  type InviteActor,
} from '../src/services/users-service'

/** Editing a company's users from Settings → Users: name, roles, active/inactive, and who may change what. */

let db: Db
let companyA: string
let companyB: string
let adminA: string
let salesA: string
let pendingA: string
let superAdminInA: string
let userB: string

const ctx = () => ({ effectiveCompanyId: companyA, isSuperAdmin: false })
const adminActor = (): InviteActor => ({ actorUserId: adminA, actorCompanyId: companyA, callerRoleIds: ['company-admin'] })

beforeAll(async () => {
  db = getDb()
  await withSystemTransaction(db, async (tx) => {
    await tx
      .insert(roles)
      .values([
        { id: 'super-admin', name: 'Super Admin', description: 'test role' },
        { id: 'company-admin', name: 'Company Admin', description: 'test role' },
        { id: 'super-user', name: 'Super User', description: 'test role' },
        { id: 'user', name: 'User', description: 'test role' },
      ])
      .onConflictDoNothing({ target: roles.id })

    const [a] = await tx
      .insert(companies)
      .values({ isSupplier: true, name: 'User Edit Co A', vatNumber: 'USREDIT-A' })
      .returning({ id: companies.id })
    const [b] = await tx
      .insert(companies)
      .values({ isSupplier: true, name: 'User Edit Co B', vatNumber: 'USREDIT-B' })
      .returning({ id: companies.id })
    companyA = a.id
    companyB = b.id

    const insertUser = async (email: string, companyId: string, roleId: string, status: 'active' | 'pending_approval') => {
      const [row] = await tx.insert(users).values({ email, companyId, roleId, status }).returning({ id: users.id })
      return row.id
    }
    adminA = await insertUser('user-edit-admin-a@example.com', companyA, 'company-admin', 'active')
    salesA = await insertUser('user-edit-sales-a@example.com', companyA, 'user', 'active')
    pendingA = await insertUser('user-edit-pending-a@example.com', companyA, 'user', 'pending_approval')
    superAdminInA = await insertUser('user-edit-super-a@example.com', companyA, 'super-admin', 'active')
    userB = await insertUser('user-edit-b@example.com', companyB, 'user', 'active')
  })
})

afterAll(async () => {
  // audit_log is append-only for previo_app — clean up as the owner, like the other service tests.
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
  await superuserDb.delete(auditLog).where(inArray(auditLog.effectiveCompanyId, [companyA, companyB]))
  await withSystemTransaction(db, async (tx) => {
    await tx.delete(users).where(inArray(users.companyId, [companyA, companyB]))
    await tx.delete(companies).where(inArray(companies.id, [companyA, companyB]))
  })
})

describe('updateCompanyUser', () => {
  it("changes a user's name, roles and status, and records the before/after on the audit entry", async () => {
    const updated = await updateCompanyUser(ctx(), adminActor(), salesA, {
      name: 'Sara Sales',
      roleIds: ['super-user', 'user'],
      status: 'inactive',
    })
    expect(updated.name).toBe('Sara Sales')
    expect(updated.status).toBe('inactive')
    expect(updated.roles.map((role) => role.id)).toEqual(['super-user', 'user'])

    const entries = await withSystemTransaction(db, (tx) =>
      tx.select().from(auditLog).where(and(eq(auditLog.resourceType, 'user'), eq(auditLog.resourceId, salesA))),
    )
    expect(entries.map((entry) => entry.action)).toEqual(['user.update'])
    expect(entries[0].metadata).toMatchObject({
      name: 'Sara Sales',
      previousName: null,
      roleIds: ['super-user', 'user'],
      previousRoleIds: ['user'],
      status: 'inactive',
      previousStatus: 'active',
    })

    // And back: reactivating works, and a blank name clears it.
    const back = await updateCompanyUser(ctx(), adminActor(), salesA, { name: null, roleIds: ['user'], status: 'active' })
    expect(back).toMatchObject({ name: null, status: 'active' })
  })

  it("can't reach a user of another company", async () => {
    await expect(updateCompanyUser(ctx(), adminActor(), userB, { name: 'x', roleIds: ['user'] })).rejects.toThrow(UserNotFoundError)
  })

  it("won't let a company-admin edit a super-admin or hand out super-admin", async () => {
    await expect(
      updateCompanyUser(ctx(), adminActor(), superAdminInA, { name: 'x', roleIds: ['user'] }),
    ).rejects.toThrow(RoleNotGrantableError)
    await expect(
      updateCompanyUser(ctx(), adminActor(), salesA, { name: null, roleIds: ['super-admin'] }),
    ).rejects.toThrow(RoleNotGrantableError)
  })

  it("won't let you deactivate yourself or drop your own Company Admin role", async () => {
    await expect(
      updateCompanyUser(ctx(), adminActor(), adminA, { name: null, roleIds: ['company-admin'], status: 'inactive' }),
    ).rejects.toThrow(UserUpdateRejectedError)
    await expect(
      updateCompanyUser(ctx(), adminActor(), adminA, { name: null, roleIds: ['user'] }),
    ).rejects.toThrow(UserUpdateRejectedError)
    // Renaming yourself is fine.
    const self = await updateCompanyUser(ctx(), adminActor(), adminA, { name: 'Anna Admin', roleIds: ['company-admin'], status: 'active' })
    expect(self.name).toBe('Anna Admin')
  })

  it("edits a pending invite's name and roles, but not its status", async () => {
    await expect(
      updateCompanyUser(ctx(), adminActor(), pendingA, { name: null, roleIds: ['user'], status: 'active' }),
    ).rejects.toThrow(UserUpdateRejectedError)
    const updated = await updateCompanyUser(ctx(), adminActor(), pendingA, { name: 'Pia', roleIds: ['super-user'] })
    expect(updated).toMatchObject({ name: 'Pia', status: 'pending_approval' })
  })

  it("won't let a super-admin drop their own Super Admin role", async () => {
    const superActor: InviteActor = { actorUserId: superAdminInA, actorCompanyId: companyA, callerRoleIds: ['super-admin'] }
    await expect(
      updateCompanyUser({ effectiveCompanyId: companyA, isSuperAdmin: true }, superActor, superAdminInA, { name: null, roleIds: ['user'] }),
    ).rejects.toThrow(UserUpdateRejectedError)
  })

  it('keeps at least one active Company Admin in the company', async () => {
    const superActor: InviteActor = { actorUserId: superAdminInA, actorCompanyId: companyA, callerRoleIds: ['super-admin'] }
    const superCtx = { effectiveCompanyId: companyA, isSuperAdmin: true }
    // adminA is company A's only active company-admin.
    await expect(
      updateCompanyUser(superCtx, superActor, adminA, { name: 'Anna Admin', roleIds: ['company-admin'], status: 'inactive' }),
    ).rejects.toThrow(/at least one active Company Admin/)
    await expect(
      updateCompanyUser(superCtx, superActor, adminA, { name: 'Anna Admin', roleIds: ['user'] }),
    ).rejects.toThrow(/at least one active Company Admin/)

    // With a second admin, demoting one of them is fine.
    await updateCompanyUser(superCtx, superActor, salesA, { name: null, roleIds: ['company-admin'], status: 'active' })
    const demoted = await updateCompanyUser(superCtx, superActor, adminA, { name: 'Anna Admin', roleIds: ['super-user'] })
    expect(demoted.roles.map((role) => role.id)).toEqual(['super-user'])
    // Put things back for the other tests.
    await updateCompanyUser(superCtx, superActor, adminA, { name: 'Anna Admin', roleIds: ['company-admin'] })
    await updateCompanyUser(superCtx, superActor, salesA, { name: null, roleIds: ['user'] })
  })

  it('writes nothing — no audit entry — when saved without changes', async () => {
    const countEntries = async () =>
      (
        await withSystemTransaction(db, (tx) =>
          tx.select().from(auditLog).where(and(eq(auditLog.resourceType, 'user'), eq(auditLog.resourceId, salesA))),
        )
      ).length
    const before = await countEntries()
    const same = await updateCompanyUser(ctx(), adminActor(), salesA, { name: null, roleIds: ['user'], status: 'active' })
    expect(same).toMatchObject({ name: null, status: 'active' })
    expect(await countEntries()).toBe(before)
  })
})
