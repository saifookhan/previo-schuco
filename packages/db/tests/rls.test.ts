import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Db } from '../src/client'
import { businessUnits, companies, roles, users } from '../src/schema'
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
 * `supplier_client_links` are NOT yet covered — flagged here rather than
 * silently left out, follow-up work per ADR 0012's coverage requirement.
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
