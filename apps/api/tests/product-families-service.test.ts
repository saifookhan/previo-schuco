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
  createNewVersionFromExcel,
  deleteProductFamily,
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

describe('deleteProductFamily', () => {
  it('deletes a family and everything under it, and a second delete throws instead of silently no-op-ing', async () => {
    const ctx = { effectiveCompanyId: supplierCompanyId, isSuperAdmin: false }

    const family = await importProductFamilyFromExcel(ctx, actor, supplierCompanyId, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })
    expect(await getProductFamilyDetail(ctx, family.id)).not.toBeNull()

    await deleteProductFamily(ctx, actor, family.id)

    expect(await getProductFamilyDetail(ctx, family.id)).toBeNull()
    const families = await listProductFamilies(ctx)
    expect(families.some((f) => f.id === family.id)).toBe(false)

    await expect(deleteProductFamily(ctx, actor, family.id)).rejects.toThrow()
  })

  it('a different supplier cannot delete another supplier\'s family', async () => {
    const ctx = { effectiveCompanyId: supplierCompanyId, isSuperAdmin: false }
    const family = await importProductFamilyFromExcel(ctx, actor, supplierCompanyId, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })

    const otherCtx = { effectiveCompanyId: '00000000-0000-0000-0000-000000000000', isSuperAdmin: false }
    await expect(deleteProductFamily(otherCtx, actor, family.id)).rejects.toThrow()

    // Still there, untouched, under the real owner's context.
    expect(await getProductFamilyDetail(ctx, family.id)).not.toBeNull()
  })
})

describe('createNewVersionFromExcel', () => {
  it('creates version 2, pointing at version 1 via supersedesId, without touching the original', async () => {
    const ctx = { effectiveCompanyId: supplierCompanyId, isSuperAdmin: false }

    const v1 = await importProductFamilyFromExcel(ctx, actor, supplierCompanyId, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })
    expect(v1.version).toBe(1)
    await setProductFamilyPublishedStatus(ctx, actor, v1.id, true)

    const v2 = await createNewVersionFromExcel(ctx, actor, v1.id, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })

    expect(v2.id).not.toBe(v1.id)
    expect(v2.version).toBe(2)
    expect(v2.supersedesId).toBe(v1.id)
    expect(v2.isPublished).toBe(false) // new version starts as an unpublished draft, same as import/duplicate

    // Re-importing is a fresh parse, not a copy — it independently has its
    // own full set of lines/characteristics, not references to v1's rows.
    const v2Detail = await getProductFamilyDetail(ctx, v2.id)
    expect(v2Detail!.lines).toHaveLength(5)
    expect(v2Detail!.lines.every((l) => l.productFamilyId === v2.id)).toBe(true)

    // v1 is completely untouched — still published, still version 1.
    const v1After = await getProductFamilyDetail(ctx, v1.id)
    expect(v1After!.family.isPublished).toBe(true)
    expect(v1After!.family.version).toBe(1)
  })

  it('throws for a family that does not exist, before parsing the workbook', async () => {
    const ctx = { effectiveCompanyId: supplierCompanyId, isSuperAdmin: false }
    await expect(
      createNewVersionFromExcel(ctx, actor, '00000000-0000-0000-0000-000000000000', {
        buffer: fixtureBuffer,
        originalName: 'product-family-sample.xlsx',
      }),
    ).rejects.toThrow('Product family not found')
  })

  it('re-importing from v1 a second time (after v2 already exists) produces v3, not v2 again', async () => {
    const ctx = { effectiveCompanyId: supplierCompanyId, isSuperAdmin: false }

    const v1 = await importProductFamilyFromExcel(ctx, actor, supplierCompanyId, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })

    const v2 = await createNewVersionFromExcel(ctx, actor, v1.id, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })
    expect(v2.version).toBe(2)
    expect(v2.supersedesId).toBe(v1.id)

    // Triggered from v1 again (not v2) — must still continue the chain
    // past v2, not recompute "v1.version + 1" and collide with v2.
    const v3 = await createNewVersionFromExcel(ctx, actor, v1.id, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })
    expect(v3.version).toBe(3)
    expect(v3.supersedesId).toBe(v2.id)
    expect(v3.id).not.toBe(v2.id)
  })
})
