process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, companies, createDb, roles, users, withSystemTransaction, type Db } from '@schuco/db'

import { getDb } from '../src/lib/db'
import { withTenantDb } from '../src/lib/tenant-db'
import { recordAuditEvent } from '../src/services/audit-service'

/**
 * Proves ADR 0010's central invariant: an audit write inside the same
 * transaction as a business mutation commits and rolls back with it — it
 * does not (and must not) survive independently of the change it records.
 */

let db: Db
let companyA: string

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
      .values({ isClient: true, name: 'Audit Txn Test Co', vatNumber: 'AUDITTXN-A' })
      .returning({ id: companies.id })
    companyA = a.id
  })
})

afterAll(async () => {
  // previo_app cannot delete audit_log rows under any circumstance —
  // append-only working as intended (a REVOKE, not an RLS row-visibility
  // rule). Cleanup uses the superuser/owner connection instead.
  const superuserUrl =
    process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo_test'
  const superuserDb = createDb(superuserUrl)
  await superuserDb.delete(auditLog).where(eq(auditLog.effectiveCompanyId, companyA))
  await superuserDb.delete(users).where(eq(users.companyId, companyA))
  await superuserDb.delete(companies).where(inArray(companies.id, [companyA]))
})

describe('audit write transactional atomicity', () => {
  it('rolls back the audit entry along with a failed business mutation', async () => {
    const ctx = { effectiveCompanyId: companyA, isSuperAdmin: false }

    await expect(
      withTenantDb(ctx, async (tx) => {
        await tx.insert(users).values({
          cognitoSub: 'audit-txn-test-user',
          email: 'audit-txn-test@example.com',
          companyId: companyA,
          roleId: 'company-admin',
          status: 'active',
        })
        await recordAuditEvent(
          tx,
          { actorType: 'system' },
          companyA,
          { action: 'test.user_create', resourceType: 'user' },
        )
        // Force a rollback after both writes have happened, to prove
        // neither survives independently of the transaction they share.
        throw new Error('forced rollback for test')
      }),
    ).rejects.toThrow('forced rollback for test')

    const auditRows = await withSystemTransaction(db, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.effectiveCompanyId, companyA)),
    )
    const userRows = await withSystemTransaction(db, (tx) =>
      tx.select().from(users).where(eq(users.companyId, companyA)),
    )

    expect(auditRows).toHaveLength(0)
    expect(userRows).toHaveLength(0)
  })

  it('commits the audit entry together with a successful business mutation', async () => {
    const ctx = { effectiveCompanyId: companyA, isSuperAdmin: false }

    await withTenantDb(ctx, async (tx) => {
      await tx.insert(users).values({
        cognitoSub: 'audit-txn-test-user-2',
        email: 'audit-txn-test-2@example.com',
        companyId: companyA,
        roleId: 'company-admin',
        status: 'active',
      })
      await recordAuditEvent(
        tx,
        { actorType: 'system' },
        companyA,
        { action: 'test.user_create', resourceType: 'user' },
      )
    })

    const auditRows = await withSystemTransaction(db, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.effectiveCompanyId, companyA)),
    )
    const userRows = await withSystemTransaction(db, (tx) =>
      tx.select().from(users).where(eq(users.companyId, companyA)),
    )

    expect(auditRows).toHaveLength(1)
    expect(userRows).toHaveLength(1)
  })
})
