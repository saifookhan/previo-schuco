import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDb, type Db } from '../src/client'
import { auditLog, companies } from '../src/schema'
import { writeAuditLog } from '../src/queries/audit'
import { withRlsTransaction, withSystemTransaction } from '../src/queries/users'
import { getTestDb } from './helpers'

/** Postgres error message lands on `.cause`, not the wrapping driver error's own `.message`. */
const expectPermissionDenied = async (fn: () => Promise<unknown>): Promise<void> => {
  let caught: unknown
  try {
    await fn()
  } catch (err) {
    caught = err
  }
  expect(caught).toBeDefined()
  const causeMessage =
    caught instanceof Error && caught.cause instanceof Error ? caught.cause.message : String(caught)
  expect(causeMessage).toMatch(/permission denied/i)
}

/**
 * RLS + append-only coverage for audit_log (ADR 0010, ADR 0012's mandatory
 * per-table RLS test requirement).
 */

let db: Db
let companyA: string
let companyB: string

beforeAll(async () => {
  db = getTestDb()
  await withSystemTransaction(db, async (tx) => {
    const [a] = await tx
      .insert(companies)
      .values({ isClient: true, name: 'Audit Test Co A', vatNumber: 'AUDITTEST-A' })
      .returning({ id: companies.id })
    const [b] = await tx
      .insert(companies)
      .values({ isClient: true, name: 'Audit Test Co B', vatNumber: 'AUDITTEST-B' })
      .returning({ id: companies.id })
    companyA = a.id
    companyB = b.id
  })
})

afterAll(async () => {
  // previo_app cannot delete audit_log rows under any circumstance —
  // that's append-only working as intended (a REVOKE, not an RLS
  // row-visibility rule; see the append-only test below). Cleanup here
  // uses the superuser/owner connection instead, exactly as a real
  // operational cleanup of this table would have to.
  const superuserUrl =
    process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
  await superuserDb.delete(auditLog).where(inArray(auditLog.effectiveCompanyId, [companyA, companyB]))
  await superuserDb.delete(companies).where(inArray(companies.id, [companyA, companyB]))
})

describe('audit_log RLS', () => {
  it('1. a tenant can see its own audit entries', async () => {
    await withSystemTransaction(db, (tx) =>
      writeAuditLog(tx, {
        actorType: 'system',
        effectiveCompanyId: companyA,
        action: 'test.event',
        resourceType: 'test',
      }),
    )

    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: false }, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.effectiveCompanyId, companyA)),
    )
    expect(rows.length).toBeGreaterThan(0)
  })

  it('2. a tenant cannot see another tenant\'s audit entries', async () => {
    await withSystemTransaction(db, (tx) =>
      writeAuditLog(tx, {
        actorType: 'system',
        effectiveCompanyId: companyB,
        action: 'test.event',
        resourceType: 'test',
      }),
    )

    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: false }, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.effectiveCompanyId, companyB)),
    )
    expect(rows).toHaveLength(0)
  })

  it('3. super-admin sees audit entries across tenants', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyA, isSuperAdmin: true }, (tx) =>
      tx.select().from(auditLog).where(inArray(auditLog.effectiveCompanyId, [companyA, companyB])),
    )
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  it('4. super-admin acting as tenant B, filtered explicitly, sees only tenant B entries', async () => {
    const rows = await withRlsTransaction(db, { companyId: companyB, isSuperAdmin: true }, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.effectiveCompanyId, companyB)),
    )
    expect(rows.every((r) => r.effectiveCompanyId === companyB)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
  })
})

describe('audit_log append-only (ADR 0010)', () => {
  it('the restricted app role cannot UPDATE an audit record', async () => {
    const row = await withSystemTransaction(db, async (tx) => {
      const [inserted] = await tx
        .insert(auditLog)
        .values({
          actorType: 'system',
          effectiveCompanyId: companyA,
          action: 'test.immutable',
          resourceType: 'test',
        })
        .returning({ id: auditLog.id })
      return inserted
    })

    await expectPermissionDenied(() =>
      withRlsTransaction(db, { companyId: companyA, isSuperAdmin: false }, (tx) =>
        tx.update(auditLog).set({ action: 'tampered' }).where(eq(auditLog.id, row.id)),
      ),
    )
  })

  it('the restricted app role cannot DELETE an audit record', async () => {
    const row = await withSystemTransaction(db, async (tx) => {
      const [inserted] = await tx
        .insert(auditLog)
        .values({
          actorType: 'system',
          effectiveCompanyId: companyA,
          action: 'test.immutable-delete',
          resourceType: 'test',
        })
        .returning({ id: auditLog.id })
      return inserted
    })

    await expectPermissionDenied(() =>
      withRlsTransaction(db, { companyId: companyA, isSuperAdmin: false }, (tx) =>
        tx.delete(auditLog).where(eq(auditLog.id, row.id)),
      ),
    )
  })

  it('is append-only even for a super-admin session — REVOKE is a privilege, not an RLS row-visibility rule', async () => {
    const row = await withSystemTransaction(db, async (tx) => {
      const [inserted] = await tx
        .insert(auditLog)
        .values({
          actorType: 'system',
          effectiveCompanyId: companyA,
          action: 'test.immutable-super-admin',
          resourceType: 'test',
        })
        .returning({ id: auditLog.id })
      return inserted
    })

    await expectPermissionDenied(() =>
      withRlsTransaction(db, { companyId: companyA, isSuperAdmin: true }, (tx) =>
        tx.delete(auditLog).where(eq(auditLog.id, row.id)),
      ),
    )
  })
})
