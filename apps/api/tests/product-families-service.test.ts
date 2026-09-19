process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { auditLog, companies, createDb, roles, users, withSystemTransaction, type Db } from '@schuco/db'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../src/lib/db'
import {
  duplicateProductFamily,
  getProductFamilyDetail,
  importProductFamilyFromExcel,
  listProductFamilies,
  setProductFamilyPublishedStatus,
} from '../src/services/product-families-service'

/**
 * Service-layer test (ADR 0012): imports a REAL supplier workbook
 * (`tests/fixtures/product-family-sample.xlsx`) through the actual
 * import service — not a synthetic fixture, not a mocked repository —
 * and asserts against counts/values verified by hand against that file
 * before this test existed. Also covers duplicate and publish, since
 * both build directly on what import creates.
 */

let db: Db
let supplierCompanyId: string
let actorUserId: string
const fixtureBuffer = readFileSync(join(__dirname, 'fixtures/product-family-sample.xlsx'))
const actor = { actorUserId: '', actorCompanyId: '', requestId: 'test-request' }

beforeAll(async () => {
  db = getDb()
  await withSystemTransaction(db, async (tx) => {
    await tx
      .insert(roles)
      .values({ id: 'company-admin', name: 'Company Admin', description: 'test role' })
      .onConflictDoNothing({ target: roles.id })

    const [company] = await tx
      .insert(companies)
      .values({ type: 'supplier', name: 'PF Service Test Supplier', vatNumber: 'PFSVC-SUP' })
      .returning({ id: companies.id })
    supplierCompanyId = company.id
    actor.actorCompanyId = supplierCompanyId

    const [user] = await tx
      .insert(users)
      .values({
        cognitoSub: 'pf-svc-test-actor',
        email: 'pf-svc-test-actor@example.com',
        companyId: supplierCompanyId,
        roleId: 'company-admin',
        status: 'active',
      })
      .returning({ id: users.id })
    actorUserId = user.id
    actor.actorUserId = actorUserId
  })
})

afterAll(async () => {
  // previo_app cannot delete audit_log rows under any circumstance —
  // that's append-only working as intended (a REVOKE, not an RLS
  // row-visibility rule; see packages/db/tests/audit-log.test.ts).
  // Cleanup here uses the superuser/owner connection instead, exactly
  // as a real operational cleanup of this table would have to.
  const superuserUrl =
    process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
  await superuserDb.delete(auditLog).where(inArray(auditLog.effectiveCompanyId, [supplierCompanyId]))

  await withSystemTransaction(db, async (tx) => {
    await tx.delete(users).where(inArray(users.id, [actorUserId]))
    await tx.delete(companies).where(inArray(companies.id, [supplierCompanyId]))
  })
})

describe('importProductFamilyFromExcel', () => {
  it('imports the full family — lines, characteristics, matrices, relations, images — from a real workbook', async () => {
    const ctx = { effectiveCompanyId: supplierCompanyId, isSuperAdmin: false }

    const family = await importProductFamilyFromExcel(ctx, actor, supplierCompanyId, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })

    expect(family.name).toBe('Tenda tecnica NEST')
    expect(family.isPublished).toBe(false)

    const detail = await getProductFamilyDetail(ctx, family.id)
    expect(detail!.lines).toHaveLength(5)
    expect(detail!.characteristics).toHaveLength(17) // 5 main + 12 sub — counted by hand against the fixture
    expect(detail!.matrices).toHaveLength(5) // 3 product-line matrices (LP1-3) + 2 characteristic matrices (C3_2, C3_3)
    expect(detail!.images).toHaveLength(3)
    expect(detail!.relations).toHaveLength(11)

    // Excel stores discount/markup as raw multipliers (0.43, 1.5); the
    // service must convert to "out of 100" before storing (43, 150) —
    // this is the exact conversion bug class that's easy to get
    // backwards or forget silently.
    const matrixLine = detail!.lines.find((l) => l.name.startsWith('N95 L'))!
    expect(matrixLine.discountPct).toBe('43.0000')
    expect(matrixLine.markupPct).toBe('150.0000')
    expect(matrixLine.pricingMatrixId).not.toBeNull()

    const formulaLine = detail!.lines.find((l) => l.name.startsWith('Guida aggintiva'))!
    expect(formulaLine.formula).toBe('(B*2/1000) * valore')
    expect(formulaLine.pricingMatrixId).toBeNull()
  })

  it('rejects a workbook missing a required sheet, before touching the DB', async () => {
    const ctx = { effectiveCompanyId: supplierCompanyId, isSuperAdmin: false }
    const notAWorkbook = Buffer.from('not an excel file')

    await expect(
      importProductFamilyFromExcel(ctx, actor, supplierCompanyId, {
        buffer: notAWorkbook,
        originalName: 'garbage.xlsx',
      }),
    ).rejects.toThrow()

    const families = await listProductFamilies(ctx)
    expect(families.every((f) => f.name !== 'garbage')).toBe(true)
  })
})

describe('duplicateProductFamily + setProductFamilyPublishedStatus', () => {
  it('duplicates a family into a new unpublished draft, then publishing it makes it independently toggleable', async () => {
    const ctx = { effectiveCompanyId: supplierCompanyId, isSuperAdmin: false }

    const original = await importProductFamilyFromExcel(ctx, actor, supplierCompanyId, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })

    const duplicate = await duplicateProductFamily(ctx, actor, original.id)
    expect(duplicate.id).not.toBe(original.id)
    expect(duplicate.duplicatedFromId).toBe(original.id)
    expect(duplicate.isPublished).toBe(false)
    expect(duplicate.name).toContain('(copy)')

    const duplicateDetail = await getProductFamilyDetail(ctx, duplicate.id)
    expect(duplicateDetail!.lines).toHaveLength(5)
    expect(duplicateDetail!.characteristics).toHaveLength(17)
    expect(duplicateDetail!.relations).toHaveLength(11)

    await setProductFamilyPublishedStatus(ctx, actor, duplicate.id, true)
    const afterPublish = await getProductFamilyDetail(ctx, duplicate.id)
    expect(afterPublish!.family.isPublished).toBe(true)

    // Publishing the duplicate must not affect the original.
    const originalAfter = await getProductFamilyDetail(ctx, original.id)
    expect(originalAfter!.family.isPublished).toBe(false)
  })
})
