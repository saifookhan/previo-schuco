process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { auditLog, companies, createDb, roles, users, withSystemTransaction, type Db } from '@schuco/db'
import { auditLogQuerySchema } from '@schuco/contracts'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../src/lib/db'
import { InvalidAuditCursorError, listAuditLog } from '../src/services/audit-service'

/**
 * Service-layer test (ADR 0012) for the audit log viewer: tenant scoping
 * (RLS + the service's own company pinning), keyset paging that neither
 * skips nor repeats entries sharing a timestamp, and the filters.
 */

let db: Db
let companyA: string
let companyB: string
let userA: string
const SAME_INSTANT = new Date('2026-03-10T10:00:00.123456Z')

const query = (input: Record<string, unknown> = {}) => auditLogQuerySchema.parse(input)
const asCompany = (companyId: string) => ({ effectiveCompanyId: companyId, isSuperAdmin: false })
const asSuperAdmin = (effectiveCompanyId: string) => ({ effectiveCompanyId, isSuperAdmin: true })

beforeAll(async () => {
  db = getDb()
  await withSystemTransaction(db, async (tx) => {
    await tx.insert(roles).values({ id: 'company-admin', name: 'Company Admin', description: 'test role' }).onConflictDoNothing({ target: roles.id })
    const [a] = await tx.insert(companies).values({ isSupplier: true, name: 'Audit Viewer A', vatNumber: 'AUDITV-A' }).returning({ id: companies.id })
    const [b] = await tx.insert(companies).values({ isClient: true, name: 'Audit Viewer B', vatNumber: 'AUDITV-B' }).returning({ id: companies.id })
    companyA = a.id
    companyB = b.id
    const [user] = await tx
      .insert(users)
      .values({ email: 'audit-viewer-a@example.com', name: 'Viewer A', companyId: companyA, roleId: 'company-admin', status: 'active' })
      .returning({ id: users.id })
    userA = user.id

    // Five entries for A — three of them at the exact same instant, to exercise the id tie-break —
    // plus two for B on another day.
    const base = { actorType: 'user' as const, resourceType: 'quote' }
    await tx.insert(auditLog).values([
      { ...base, effectiveCompanyId: companyA, actorUserId: userA, actorCompanyId: companyA, action: 'quote.create', resourceId: 'q1', createdAt: new Date('2026-03-09T09:00:00Z') },
      { ...base, effectiveCompanyId: companyA, actorUserId: userA, actorCompanyId: companyA, action: 'quote.add_position', resourceId: 'q1', createdAt: SAME_INSTANT },
      { ...base, effectiveCompanyId: companyA, actorUserId: userA, actorCompanyId: companyA, action: 'quote.add_position', resourceId: 'q1', createdAt: SAME_INSTANT },
      { ...base, effectiveCompanyId: companyA, actorUserId: userA, actorCompanyId: companyA, action: 'quote.add_position', resourceId: 'q2', createdAt: SAME_INSTANT, requestId: 'req-audit-viewer' },
      { ...base, effectiveCompanyId: companyA, actorType: 'system', action: 'quote.recalculate', resourceId: 'q2', createdAt: new Date('2026-03-11T08:00:00Z') },
      { ...base, effectiveCompanyId: companyB, action: 'quote.create', resourceId: 'qb', createdAt: new Date('2026-03-12T08:00:00Z') },
      { ...base, effectiveCompanyId: companyB, action: 'quote.create', resourceId: 'qb2', createdAt: new Date('2026-03-12T09:00:00Z') },
    ])
  })
})

afterAll(async () => {
  // audit_log is append-only for the app role (ADR 0010) — cleanup needs the superuser connection.
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
  await superuserDb.delete(auditLog).where(inArray(auditLog.effectiveCompanyId, [companyA, companyB]))
  await superuserDb.$client.end()
  await withSystemTransaction(db, async (tx) => {
    await tx.delete(users).where(inArray(users.companyId, [companyA, companyB]))
    await tx.delete(companies).where(inArray(companies.id, [companyA, companyB]))
  })
})

describe('listAuditLog', () => {
  it('shows a company only its own entries, newest first, with actor and company names', async () => {
    const page = await listAuditLog(asCompany(companyA), query())
    expect(page.entries).toHaveLength(5)
    expect(page.entries.every((entry) => entry.company.id === companyA)).toBe(true)
    expect(page.entries[0].action).toBe('quote.recalculate')
    expect(page.entries[0].actor).toBeNull()
    expect(page.entries[1].actor).toEqual({ id: userA, name: 'Viewer A', email: 'audit-viewer-a@example.com' })
    expect(page.entries[1].company.name).toBe('Audit Viewer A')
    expect(page.nextCursor).toBeNull()
  })

  it('ignores companyId for a non-super-admin (cannot peek at another company)', async () => {
    const page = await listAuditLog(asCompany(companyA), query({ companyId: companyB }))
    expect(page.entries.every((entry) => entry.company.id === companyA)).toBe(true)
  })

  it('limits a super-admin to the current company on the settings page (scope=company) and when acting as a tenant', async () => {
    const settingsPage = await listAuditLog(asSuperAdmin(companyA), query({ scope: 'company', companyId: companyB }))
    expect(settingsPage.entries.every((entry) => entry.company.id === companyA)).toBe(true)
    const actingAsA = await listAuditLog({ ...asSuperAdmin(companyA), isActingAsTenant: true }, query())
    expect(actingAsA.entries.every((entry) => entry.company.id === companyA)).toBe(true)
  })

  it('lets a super-admin filter by company', async () => {
    const page = await listAuditLog(asSuperAdmin(companyA), query({ companyId: companyB }))
    expect(page.entries.map((entry) => entry.resourceId)).toEqual(['qb2', 'qb'])
  })

  it('pages through entries that share a timestamp without skipping or repeating any', async () => {
    const seen: string[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const page = await listAuditLog(asCompany(companyA), query({ limit: 2, cursor }))
      seen.push(...page.entries.map((entry) => entry.id))
      cursor = page.nextCursor ?? undefined
      pages += 1
    } while (cursor && pages < 10)

    expect(pages).toBe(3)
    expect(seen).toHaveLength(5)
    expect(new Set(seen).size).toBe(5)
  })

  it('filters by resource, request id and actor', async () => {
    const byResource = await listAuditLog(asCompany(companyA), query({ resourceType: 'quote', resourceId: 'q2' }))
    expect(byResource.entries).toHaveLength(2)
    const byRequest = await listAuditLog(asCompany(companyA), query({ requestId: 'req-audit-viewer' }))
    expect(byRequest.entries).toHaveLength(1)
    const byActor = await listAuditLog(asCompany(companyA), query({ actorUserId: userA }))
    expect(byActor.entries).toHaveLength(4)
  })

  it('treats a date-only `to` as including that whole day', async () => {
    const page = await listAuditLog(asCompany(companyA), query({ from: '2026-03-10', to: '2026-03-10' }))
    expect(page.entries).toHaveLength(3)
  })

  it('rejects a cursor it did not issue', async () => {
    await expect(listAuditLog(asCompany(companyA), query({ cursor: 'not-a-cursor' }))).rejects.toThrow(InvalidAuditCursorError)
    const forged = Buffer.from(JSON.stringify({ t: '2026-03-10T10:00:00Z', i: 'not-a-uuid' })).toString('base64url')
    await expect(listAuditLog(asCompany(companyA), query({ cursor: forged }))).rejects.toThrow(InvalidAuditCursorError)
  })
})
