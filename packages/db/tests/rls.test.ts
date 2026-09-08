import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Db } from '../src/client'
import { businessUnits, companies, roles, supplierClientLinks, userBusinessUnits, users } from '../src/schema'
import { withRlsTransaction, withSystemTransaction } from '../src/queries/users'
import { getTestDb } from './helpers'

/**
 * ADR 0012 mandates, for every tenant-scoped table/policy, at least one
 * integration test proving: (1) a tenant can access its own records, (2) a
 * tenant cannot access another tenant's records, (3) super-admin behavior
 * is correct, (4) acting-as-tenant behavior is correct where applicable.
 *
 * This file covers `companies` and `users` fully. `business_units` gets
 * the cross-tenant-denial case (the one that matters most and is most
 * likely to silently regress). `user_business_units` and
 * `supplier_client_links` are covered below.
 */

let db: Db
let companyA: string
let companyB: string

beforeAll(async () => {
  db = getTestDb()

  await withSystemTransaction(db, async (tx) => {
    await tx.insert(roles).values({
      id: 'company-admin',
      name: 'Company Admin',
      description: 'test role',
    }).onConflictDoNothing({ target: roles.id })

    const [a] = await tx
      .insert(companies)
      .values({ type: 'client', name: 'RLS Test Co A', vatNumber: 'RLSTEST-A' })
      .returning({ id: companies.id })
    const [b] = await tx
      .insert(companies)
      .values({ type: 'client', name: 'RLS Test Co B', vatNumber: 'RLSTEST-B' })
      .returning({ id: companies.id })

    companyA = a.id
    companyB = b.id
  })
})

afterAll(async () => {
  await withSystemTransaction(db, async (tx) => {
    // FK order: dependents before the companies they reference.
    await tx.delete(users).where(inArray(users.companyId, [companyA, companyB]))
    await tx.delete(businessUnits).where(inArray(businessUnits.companyId, [companyA, companyB]))
    await tx.delete(companies).where(inArray(companies.id, [companyA, companyB]))
  })
})

describe('companies RLS', () => {
  it('1. a tenant can access its own record', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: false }, (tx) =>
      tx.select().from(companies).where(eq(companies.id, companyA)),
    )
    expect(rows).toHaveLength(1)
  })

  it('2. a tenant cannot access another tenant\'s record', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: false }, (tx) =>
      tx.select().from(companies).where(eq(companies.id, companyB)),
    )
    expect(rows).toHaveLength(0)
  })

  it('3. super-admin sees across tenants', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: true }, (tx) =>
      tx.select().from(companies),
    )
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(companyA)
    expect(ids).toContain(companyB)
  })

  it('4. acting-as-tenant: RLS alone does not narrow a super-admin, but an explicit company filter does (see ADR 0006/0008)', async () => {
    const unfiltered = await withRlsTransaction(db, { companyId: companyB, isSuperAdmin: true }, (tx) =>
      tx.select().from(companies),
    )
    // RLS's `is_super_admin() OR ...` means the companyId GUC doesn't narrow results by itself.
    expect(unfiltered.map((r) => r.id)).toContain(companyA)

    const filtered = await withRlsTransaction(db, { companyId: companyB, isSuperAdmin: true }, (tx) =>
      tx.select().from(companies).where(eq(companies.id, companyB)),
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe(companyB)
  })
})

describe('users RLS', () => {
  let userA: string
  let userB: string

  beforeAll(async () => {
    await withSystemTransaction(db, async (tx) => {
      const [a] = await tx
        .insert(users)
        .values({
          cognitoSub: 'rls-test-user-a',
          email: 'rls-test-a@example.com',
          companyId: companyA,
          roleId: 'company-admin',
          status: 'active',
        })
        .returning({ id: users.id })
      const [b] = await tx
        .insert(users)
        .values({
          cognitoSub: 'rls-test-user-b',
          email: 'rls-test-b@example.com',
          companyId: companyB,
          roleId: 'company-admin',
          status: 'active',
        })
        .returning({ id: users.id })
      userA = a.id
      userB = b.id
    })
  })

  it('1. a tenant can access its own users', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: false }, (tx) =>
      tx.select().from(users).where(eq(users.companyId, companyA)),
    )
    expect(rows.map((r) => r.id)).toContain(userA)
  })

  it('2. a tenant cannot access another tenant\'s users', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: false }, (tx) =>
      tx.select().from(users).where(eq(users.id, userB)),
    )
    expect(rows).toHaveLength(0)
  })

  it('3. super-admin sees users across tenants', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: true }, (tx) =>
      tx.select().from(users),
    )
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(userA)
    expect(ids).toContain(userB)
  })

  it('4. acting-as-tenant with an explicit company filter narrows to that tenant only', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyB, isSuperAdmin: true }, (tx) =>
      tx.select().from(users).where(eq(users.companyId, companyB)),
    )
    expect(rows.map((r) => r.id)).toEqual([userB])
  })
})

describe('business_units RLS', () => {
  it('2. a tenant cannot access another tenant\'s business unit', async () => {
    const buId = await withSystemTransaction(db, async (tx) => {
      const [bu] = await tx
        .insert(businessUnits)
        .values({ companyId: companyB, name: 'RLS Test BU' })
        .returning({ id: businessUnits.id })
      return bu.id
    })

    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: false }, (tx) =>
      tx.select().from(businessUnits).where(eq(businessUnits.id, buId)),
    )
    expect(rows).toHaveLength(0)
  })
})

describe('user_business_units RLS', () => {
  // Policy checks the row's user's company, not the business unit's — so
  // fixtures deliberately give each user and their BU the same company.
  let buA: string
  let buB: string
  let userA: string
  let userB: string

  beforeAll(async () => {
    await withSystemTransaction(db, async (tx) => {
      const [a] = await tx
        .insert(businessUnits)
        .values({ companyId: companyA, name: 'UBU Test BU A' })
        .returning({ id: businessUnits.id })
      const [b] = await tx
        .insert(businessUnits)
        .values({ companyId: companyB, name: 'UBU Test BU B' })
        .returning({ id: businessUnits.id })
      buA = a.id
      buB = b.id

      const [ua] = await tx
        .insert(users)
        .values({
          cognitoSub: 'rls-test-ubu-user-a',
          email: 'rls-test-ubu-a@example.com',
          companyId: companyA,
          roleId: 'company-admin',
          status: 'active',
        })
        .returning({ id: users.id })
      const [ub] = await tx
        .insert(users)
        .values({
          cognitoSub: 'rls-test-ubu-user-b',
          email: 'rls-test-ubu-b@example.com',
          companyId: companyB,
          roleId: 'company-admin',
          status: 'active',
        })
        .returning({ id: users.id })
      userA = ua.id
      userB = ub.id

      await tx.insert(userBusinessUnits).values([
        { userId: userA, businessUnitId: buA, canEdit: true },
        { userId: userB, businessUnitId: buB, canEdit: true },
      ])
    })
  })

  it('1. a tenant can access its own membership row', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: false }, (tx) =>
      tx.select().from(userBusinessUnits).where(eq(userBusinessUnits.userId, userA)),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].businessUnitId).toBe(buA)
  })

  it('2. a tenant cannot access another tenant\'s membership row', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: false }, (tx) =>
      tx.select().from(userBusinessUnits).where(eq(userBusinessUnits.userId, userB)),
    )
    expect(rows).toHaveLength(0)
  })

  it('3. super-admin sees membership rows across tenants', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: true }, (tx) =>
      tx.select().from(userBusinessUnits),
    )
    const userIds = rows.map((r) => r.userId)
    expect(userIds).toContain(userA)
    expect(userIds).toContain(userB)
  })

  it('4. acting-as-tenant with an explicit user filter narrows to that tenant only', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyB, isSuperAdmin: true }, (tx) =>
      tx.select().from(userBusinessUnits).where(eq(userBusinessUnits.userId, userB)),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].businessUnitId).toBe(buB)
  })
})

describe('supplier_client_links RLS', () => {
  // A third company that is neither the supplier nor the client on the
  // second link, so it's a genuine cross-tenant negative case rather than
  // "the other half of the same relationship" (which companyA/B already
  // are of each other on link1's own terms).
  let companyC: string
  let linkAB: { supplierCompanyId: string; clientCompanyId: string }
  let linkBC: { supplierCompanyId: string; clientCompanyId: string }

  beforeAll(async () => {
    await withSystemTransaction(db, async (tx) => {
      const [c] = await tx
        .insert(companies)
        .values({ type: 'client', name: 'RLS Test Co C', vatNumber: 'RLSTEST-C' })
        .returning({ id: companies.id })
      companyC = c.id

      linkAB = { supplierCompanyId: companyA, clientCompanyId: companyB }
      linkBC = { supplierCompanyId: companyB, clientCompanyId: companyC }
      await tx.insert(supplierClientLinks).values([linkAB, linkBC])
    })
  })

  afterAll(async () => {
    await withSystemTransaction(db, async (tx) => {
      await tx.delete(companies).where(eq(companies.id, companyC))
    })
  })

  it('1. a tenant can access a link where it is a party (as supplier or client)', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: false }, (tx) =>
      tx
        .select()
        .from(supplierClientLinks)
        .where(eq(supplierClientLinks.supplierCompanyId, linkAB.supplierCompanyId)),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].clientCompanyId).toBe(companyB)
  })

  it('2. a tenant cannot access a link where it is neither party', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: false }, (tx) =>
      tx
        .select()
        .from(supplierClientLinks)
        .where(eq(supplierClientLinks.clientCompanyId, companyC)),
    )
    expect(rows).toHaveLength(0)
  })

  it('3. super-admin sees links across tenants', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: true }, (tx) =>
      tx.select().from(supplierClientLinks),
    )
    const pairs = rows.map((r) => `${r.supplierCompanyId}:${r.clientCompanyId}`)
    expect(pairs).toContain(`${linkAB.supplierCompanyId}:${linkAB.clientCompanyId}`)
    expect(pairs).toContain(`${linkBC.supplierCompanyId}:${linkBC.clientCompanyId}`)
  })

  it('4. acting-as-tenant with an explicit filter narrows to that tenant\'s links only', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyC, isSuperAdmin: true }, (tx) =>
      tx.select().from(supplierClientLinks).where(eq(supplierClientLinks.clientCompanyId, companyC)),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].supplierCompanyId).toBe(companyB)
  })
})
