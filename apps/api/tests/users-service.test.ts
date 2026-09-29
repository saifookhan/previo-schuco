process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { companies, roles, users, withSystemTransaction, type Db } from '@schuco/db'

import { getDb } from '../src/lib/db'
import { listAllUsers, listUsersForCompany } from '../src/services/users-service'

/**
 * Service-layer test (ADR 0012): exercises `usersService` — a route ->
 * service -> repository call with a real test DB, not a mocked
 * repository, since the thing worth proving here is that the service
 * correctly narrows by `effectiveCompanyId` (the exact bug class found in
 * ADR 0006/0008's implementation).
 */

let db: Db
let companyA: string
let companyB: string
let userA: string
let userB: string

beforeAll(async () => {
  db = getDb()

  await withSystemTransaction(db, async (tx) => {
    await tx.insert(roles).values({
      id: 'company-admin',
      name: 'Company Admin',
      description: 'test role',
    }).onConflictDoNothing({ target: roles.id })

    const [a] = await tx
      .insert(companies)
      .values({ type: 'client', name: 'Service Test Co A', vatNumber: 'SVCTEST-A' })
      .returning({ id: companies.id })
    const [b] = await tx
      .insert(companies)
      .values({ type: 'client', name: 'Service Test Co B', vatNumber: 'SVCTEST-B' })
      .returning({ id: companies.id })
    companyA = a.id
    companyB = b.id

    const [ua] = await tx
      .insert(users)
      .values({
        cognitoSub: 'svc-test-user-a',
        email: 'svc-test-a@example.com',
        companyId: companyA,
        roleId: 'company-admin',
        status: 'active',
      })
      .returning({ id: users.id })
    const [ub] = await tx
      .insert(users)
      .values({
        cognitoSub: 'svc-test-user-b',
        email: 'svc-test-b@example.com',
        companyId: companyB,
        roleId: 'company-admin',
        status: 'active',
      })
      .returning({ id: users.id })
    userA = ua.id
    userB = ub.id
  })
})

afterAll(async () => {
  await withSystemTransaction(db, async (tx) => {
    await tx.delete(users).where(inArray(users.companyId, [companyA, companyB]))
    await tx.delete(companies).where(inArray(companies.id, [companyA, companyB]))
  })
})

describe('listUsersForCompany', () => {
  it('returns only the caller company-admin\'s own company, not another tenant\'s', async () => {
    const rows = await listUsersForCompany({ effectiveCompanyId: companyA, isSuperAdmin: false })
    expect(rows.map((r) => r.id)).toEqual([userA])
  })

  it('narrows a super-admin acting as another tenant to only that tenant', async () => {
    const rows = await listUsersForCompany({ effectiveCompanyId: companyB, isSuperAdmin: true })
    expect(rows.map((r) => r.id)).toEqual([userB])
  })
})

describe('listAllUsers', () => {
  it('is unscoped — returns users across companies for a super-admin', async () => {
    const rows = await listAllUsers({ effectiveCompanyId: companyA, isSuperAdmin: true })
    const ids = rows.map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining([userA, userB]))
  })
})
