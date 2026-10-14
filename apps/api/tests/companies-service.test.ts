process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  auditLog,
  companies,
  createDb,
  getUserProfileByCognitoSub,
  roles,
  users,
  withSystemTransaction,
  type Db,
} from '@schuco/db'

import { getDb } from '../src/lib/db'
import {
  CompanyNotFoundError,
  createCompany,
  listCompanies,
  setCompanyActiveStatus,
  updateCompanyDetails,
} from '../src/services/companies-service'

/**
 * Service-layer test (ADR 0012): the super-admin company CRUD, and the
 * one thing that makes deactivation actually mean something —
 * requireAuth's block on a deactivated company's users — checked here at
 * the data level (the profile query it reads from), not by spinning up
 * an HTTP request.
 */

let db: Db
const superAdminCtx = { effectiveCompanyId: '', isSuperAdmin: true }
const actor = { actorUserId: '', actorCompanyId: '' }
const createdCompanyIds: string[] = []

beforeAll(async () => {
  db = getDb()
  await withSystemTransaction(db, async (tx) => {
    await tx
      .insert(roles)
      .values({ id: 'company-admin', name: 'Company Admin', description: 'test role' })
      .onConflictDoNothing({ target: roles.id })

    const [platform] = await tx
      .insert(companies)
      .values({ isPlatform: true, name: 'Companies Service Test Platform', vatNumber: 'CSVC-PLAT' })
      .returning({ id: companies.id })
    superAdminCtx.effectiveCompanyId = platform.id
    actor.actorCompanyId = platform.id
    createdCompanyIds.push(platform.id)

    const [superAdminUser] = await tx
      .insert(users)
      .values({
        cognitoSub: 'csvc-test-super-admin',
        email: 'csvc-test-super-admin@example.com',
        companyId: platform.id,
        roleId: 'company-admin',
        status: 'active',
      })
      .returning({ id: users.id })
    actor.actorUserId = superAdminUser.id
  })
})

afterAll(async () => {
  // audit_log is append-only (ADR 0010) — its FK to companies blocks a
  // plain-role delete, so its cleanup needs the superuser connection.
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
  await superuserDb.delete(auditLog).where(inArray(auditLog.effectiveCompanyId, createdCompanyIds))

  await withSystemTransaction(db, async (tx) => {
    await tx.delete(users).where(inArray(users.companyId, createdCompanyIds))
    await tx.delete(companies).where(inArray(companies.id, createdCompanyIds))
  })
})

describe('createCompany + listCompanies', () => {
  it('creates a company active by default, and it shows up in the unscoped platform list', async () => {
    const company = await createCompany(superAdminCtx, actor, {
      capabilities: { platform: false, manufacturer: true, supplier: true, client: false },
      name: 'CSVC Test Supplier',
      vatNumber: 'CSVC-SUP',
    })
    createdCompanyIds.push(company.id)
    expect(company.isActive).toBe(true)
    expect([company.isManufacturer, company.isSupplier, company.isClient]).toEqual([true, true, false])

    const all = await listCompanies(superAdminCtx)
    expect(all.map((c) => c.id)).toContain(company.id)
  })
})

describe('updateCompanyDetails', () => {
  it("updates a company's own fields and rejects an unknown id", async () => {
    const company = await createCompany(superAdminCtx, actor, {
      capabilities: { platform: false, manufacturer: false, supplier: false, client: true },
      name: 'CSVC Test Client',
      vatNumber: 'CSVC-CLI',
    })
    createdCompanyIds.push(company.id)

    const updated = await updateCompanyDetails(superAdminCtx, actor, company.id, { name: 'CSVC Test Client Renamed' })
    expect(updated.name).toBe('CSVC Test Client Renamed')
    expect(updated.vatNumber).toBe('CSVC-CLI') // untouched fields survive a partial update
    expect(updated.isClient).toBe(true) // capabilities untouched when not passed

    const both = await updateCompanyDetails(superAdminCtx, actor, company.id, {
      capabilities: { platform: false, manufacturer: true, supplier: false, client: true },
    })
    expect([both.isManufacturer, both.isClient]).toEqual([true, true]) // one company can hold several capabilities

    await expect(
      updateCompanyDetails(superAdminCtx, actor, '00000000-0000-0000-0000-000000000000', { name: 'x' }),
    ).rejects.toThrow(CompanyNotFoundError)
  })
})

describe('setCompanyActiveStatus', () => {
  it('deactivating a company is reflected in its users\' profile — the exact flag requireAuth blocks logins on', async () => {
    const company = await createCompany(superAdminCtx, actor, {
      capabilities: { platform: false, manufacturer: false, supplier: false, client: true },
      name: 'CSVC Test Deactivation Co',
      vatNumber: 'CSVC-DEACT',
    })
    createdCompanyIds.push(company.id)

    await withSystemTransaction(db, (tx) =>
      tx.insert(users).values({
        cognitoSub: 'csvc-test-deactivation-user',
        email: 'csvc-test-deactivation-user@example.com',
        companyId: company.id,
        roleId: 'company-admin',
        status: 'active',
      }),
    )

    const beforeProfile = await withSystemTransaction(db, (tx) => getUserProfileByCognitoSub(tx, 'csvc-test-deactivation-user'))
    expect(beforeProfile?.company.isActive).toBe(true)

    const deactivated = await setCompanyActiveStatus(superAdminCtx, actor, company.id, false)
    expect(deactivated.isActive).toBe(false)

    const afterProfile = await withSystemTransaction(db, (tx) => getUserProfileByCognitoSub(tx, 'csvc-test-deactivation-user'))
    expect(afterProfile?.company.isActive).toBe(false)

    const reactivated = await setCompanyActiveStatus(superAdminCtx, actor, company.id, true)
    expect(reactivated.isActive).toBe(true)

    await expect(
      setCompanyActiveStatus(superAdminCtx, actor, '00000000-0000-0000-0000-000000000000', false),
    ).rejects.toThrow(CompanyNotFoundError)
  })
})
