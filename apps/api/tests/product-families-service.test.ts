process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { auditLog, companies, createDb, productFamilies, roles, users, withSystemTransaction, type Db } from '@schuco/db'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../src/lib/db'
import {
  createNewVersionFromExcel,
  deleteProductFamily,
  duplicateProductFamily,
  getProductFamilyDetail,
  getProductFamilyVersions,
  PriceValidityOverlapError,
  importProductFamilyFromExcel,
  ExcelImportError,
  listProductFamilies,
  previewProductFamilyImport,
  setProductFamilyHasPriceListStatus,
  setProductFamilyPriceValidityDates,
  setProductFamilyReadyForInvoicingStatus,
  setProductFamilyPublishedStatus,
  updateCharacteristic,
  updatePricingMatrix,
  updateProductLine,
} from '../src/services/product-families-service'
import {
  ProductFamilyLockedError,
  ProductFamilyNotFoundError,
  ProductFamilyValidationError,
} from '../src/lib/product-family-edit'

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
      .values({ isManufacturer: true, isSupplier: true, name: 'PF Service Test Supplier', vatNumber: 'PFSVC-SUP' })
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
    // A v1 workbook keeps its template's "2xAltezza" formula.
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

    const duplicate = await duplicateProductFamily(ctx, actor, original.id, {
      name: `${original.name} (copy)`,
      priceValidFrom: '2027-01-01',
      priceValidTo: null,
      publish: false,
    })
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

  it('uses the name, dates and publish choice from the copy dialog, and records them on the audit entry', async () => {
    const ctx = { effectiveCompanyId: supplierCompanyId, isSuperAdmin: false }
    const original = await importProductFamilyFromExcel(
      ctx,
      actor,
      supplierCompanyId,
      { buffer: fixtureBuffer, originalName: 'product-family-sample.xlsx' },
      { priceValidFrom: '2026-01-01', priceValidTo: '2026-12-31' },
    )

    const copy = await duplicateProductFamily(ctx, actor, original.id, {
      name: 'NEST 2027',
      priceValidFrom: '2027-01-01',
      priceValidTo: null,
      publish: true,
      readyForInvoicing: true,
    })
    expect(copy).toMatchObject({ name: 'NEST 2027', priceValidFrom: '2027-01-01', priceValidTo: null, isPublished: true, readyForInvoicing: true })

    const originalAfter = await getProductFamilyDetail(ctx, original.id)
    expect(originalAfter!.family).toMatchObject({ priceValidFrom: '2026-01-01', priceValidTo: '2026-12-31', isPublished: false })

    const entries = await withSystemTransaction(db, (tx) =>
      tx.select().from(auditLog).where(and(eq(auditLog.resourceType, 'product_family'), eq(auditLog.resourceId, copy.id))),
    )
    expect(entries.map((entry) => entry.action)).toEqual(['product_family.duplicate'])
    expect(entries[0].metadata).toMatchObject({
      duplicatedFromId: original.id,
      priceValidFrom: '2027-01-01',
      priceValidTo: null,
      published: true,
      readyForInvoicing: true,
    })
  })

  it('throws ProductFamilyNotFoundError copying a family the caller cannot see', async () => {
    const otherCtx = { effectiveCompanyId: '00000000-0000-0000-0000-000000000000', isSuperAdmin: false }
    await expect(
      duplicateProductFamily(otherCtx, actor, '00000000-0000-0000-0000-000000000001', {
        name: 'x',
        priceValidFrom: '2027-01-01',
        priceValidTo: null,
        publish: false,
        readyForInvoicing: false,
      }),
    ).rejects.toThrow(ProductFamilyNotFoundError)
  })

  it("throws (never silently succeeds) publishing a family the caller doesn't own — RLS blocks the UPDATE, zero rows changed", async () => {
    const ctx = { effectiveCompanyId: supplierCompanyId, isSuperAdmin: false }
    const family = await importProductFamilyFromExcel(ctx, actor, supplierCompanyId, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })

    const otherCtx = { effectiveCompanyId: '00000000-0000-0000-0000-000000000000', isSuperAdmin: false }
    await expect(setProductFamilyPublishedStatus(otherCtx, actor, family.id, true)).rejects.toThrow(
      ProductFamilyNotFoundError,
    )

    // Untouched, under the real owner's context.
    const stillOwn = await getProductFamilyDetail(ctx, family.id)
    expect(stillOwn!.family.isPublished).toBe(false)
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

describe('pricing edits (matrix, line, characteristic)', () => {
  const ctx = () => ({ effectiveCompanyId: supplierCompanyId, isSuperAdmin: false })
  const importFresh = () =>
    importProductFamilyFromExcel(ctx(), actor, supplierCompanyId, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })

  afterEach(() => {
    delete process.env.PRODUCT_FAMILY_EDIT_POLICY
  })

  it('edits a pricing matrix: changed cells, an emptied cell, and a new column all persist', async () => {
    const family = await importFresh()
    const detail = await getProductFamilyDetail(ctx(), family.id)
    const matrix = detail!.matrices[0]

    const widths = [...matrix.widths, matrix.widths[matrix.widths.length - 1] + 200]
    const grid = matrix.matrix.map((row) => [...row, 999])
    grid[1][1] = null

    const updated = await updatePricingMatrix(ctx(), actor, family.id, matrix.id, {
      widths,
      heights: matrix.heights,
      matrix: grid,
    })
    expect(updated.widths).toEqual(widths)

    const after = (await getProductFamilyDetail(ctx(), family.id))!
    const reread = after.matrices.find((m) => m.id === matrix.id)!
    expect(reread.widths).toHaveLength(matrix.widths.length + 1)
    expect(reread.matrix[0][reread.widths.length - 1]).toBe(999)
    expect(reread.matrix[1][1]).toBeNull()
    expect(new Date(after.family.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(family.updatedAt).getTime())
  })

  it('rejects an invalid matrix without writing anything', async () => {
    const family = await importFresh()
    const detail = await getProductFamilyDetail(ctx(), family.id)
    const matrix = detail!.matrices[0]

    await expect(
      updatePricingMatrix(ctx(), actor, family.id, matrix.id, {
        widths: [1000, 800],
        heights: [800],
        matrix: [[1, 2]],
      }),
    ).rejects.toThrow(ProductFamilyValidationError)

    const reread = (await getProductFamilyDetail(ctx(), family.id))!.matrices.find((m) => m.id === matrix.id)!
    expect(reread.widths).toEqual(matrix.widths)
  })

  it('edits a product line\'s value, discount, markup and formula', async () => {
    const family = await importFresh()
    const line = (await getProductFamilyDetail(ctx(), family.id))!.lines.find((l) =>
      l.name.startsWith('Guida aggintiva'),
    )!

    const updated = await updateProductLine(ctx(), actor, family.id, line.id, {
      value: 12.5,
      discountPct: 20,
      markupPct: 130,
      formula: '(B/1000) * valore',
    })
    expect(Number(updated.value)).toBe(12.5)
    expect(Number(updated.discountPct)).toBe(20)
    expect(Number(updated.markupPct)).toBe(130)
    expect(updated.formula).toBe('(B/1000) * valore')

    await expect(updateProductLine(ctx(), actor, family.id, line.id, { formula: 'valor * 2' })).rejects.toThrow(
      ProductFamilyValidationError,
    )
  })

  it('edits a sub-characteristic but not a top-level one (no price of its own)', async () => {
    const family = await importFresh()
    const detail = (await getProductFamilyDetail(ctx(), family.id))!
    const sub = detail.characteristics.find((c) => c.parentId && c.value !== null)!
    const top = detail.characteristics.find((c) => !c.parentId)!

    const updated = await updateCharacteristic(ctx(), actor, family.id, sub.id, { value: 7 })
    expect(Number(updated.value)).toBe(7)

    await expect(updateCharacteristic(ctx(), actor, family.id, top.id, { value: 1 })).rejects.toThrow(
      ProductFamilyNotFoundError,
    )
  })

  it("won't edit another family's matrix through this family's URL", async () => {
    const a = await importFresh()
    const b = await importFresh()
    const bMatrix = (await getProductFamilyDetail(ctx(), b.id))!.matrices[0]

    await expect(
      updatePricingMatrix(ctx(), actor, a.id, bMatrix.id, {
        widths: bMatrix.widths,
        heights: bMatrix.heights,
        matrix: bMatrix.matrix,
      }),
    ).rejects.toThrow(ProductFamilyNotFoundError)
  })

  it('a different company cannot edit at all (RLS): reported as not found', async () => {
    const family = await importFresh()
    const line = (await getProductFamilyDetail(ctx(), family.id))!.lines[0]
    const stranger = { effectiveCompanyId: '00000000-0000-0000-0000-000000000000', isSuperAdmin: false }

    await expect(updateProductLine(stranger, actor, family.id, line.id, { value: 1 })).rejects.toThrow(
      ProductFamilyNotFoundError,
    )
  })

  it('default policy edits published families; "draft-only" locks them (409) and unlocks on unpublish', async () => {
    const family = await importFresh()
    const line = (await getProductFamilyDetail(ctx(), family.id))!.lines[0]
    await setProductFamilyPublishedStatus(ctx(), actor, family.id, true)

    await updateProductLine(ctx(), actor, family.id, line.id, { value: 3 })

    process.env.PRODUCT_FAMILY_EDIT_POLICY = 'draft-only'
    await expect(updateProductLine(ctx(), actor, family.id, line.id, { value: 4 })).rejects.toThrow(
      ProductFamilyLockedError,
    )
    expect(Number((await getProductFamilyDetail(ctx(), family.id))!.lines.find((l) => l.id === line.id)!.value)).toBe(3)

    await setProductFamilyPublishedStatus(ctx(), actor, family.id, false)
    await updateProductLine(ctx(), actor, family.id, line.id, { value: 4 })
  })
})

describe('listProductFamilies', () => {
  it('is scoped by effectiveCompanyId even for a super-admin — never every tenant\'s families', async () => {
    const ownCtx = { effectiveCompanyId: supplierCompanyId, isSuperAdmin: false }
    const ownFamily = await importProductFamilyFromExcel(ownCtx, actor, supplierCompanyId, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })

    const [otherCompany] = await withSystemTransaction(db, (tx) =>
      tx
        .insert(companies)
        .values({ isManufacturer: true, isSupplier: true, name: 'PF Service Test Other Supplier', vatNumber: 'PFSVC-OTHER' })
        .returning({ id: companies.id }),
    )
    const otherCtx = { effectiveCompanyId: otherCompany.id, isSuperAdmin: false }
    const otherFamily = await importProductFamilyFromExcel(otherCtx, actor, otherCompany.id, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })

    try {
      // A super-admin acting AS supplierCompanyId (X-Tenant-Id) must see only that
      // tenant's families — not otherCompany's too, even though isSuperAdmin is true.
      const superAdminAsSupplier = { effectiveCompanyId: supplierCompanyId, isSuperAdmin: true }
      const visible = await listProductFamilies(superAdminAsSupplier)
      expect(visible.some((f) => f.id === ownFamily.id)).toBe(true)
      expect(visible.some((f) => f.id === otherFamily.id)).toBe(false)
    } finally {
      const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
      const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
      await superuserDb.delete(auditLog).where(inArray(auditLog.effectiveCompanyId, [otherCompany.id]))
      await withSystemTransaction(db, async (tx) => {
        await tx.delete(companies).where(inArray(companies.id, [otherCompany.id]))
      })
    }
  })
})

describe('upload dialog: preview, then save with the confirmed fields', () => {
  const ctx = () => ({ effectiveCompanyId: supplierCompanyId, isSuperAdmin: false })
  const familyCount = () =>
    withSystemTransaction(db, async (tx) =>
      (await tx.select({ id: productFamilies.id }).from(productFamilies).where(eq(productFamilies.supplierCompanyId, supplierCompanyId))).length,
    )

  it('previews what the workbook holds without saving anything', async () => {
    const before = await familyCount()
    const preview = await previewProductFamilyImport({ buffer: fixtureBuffer, originalName: 'product-family-sample.xlsx' })

    expect(preview.family.name).toBe('Tenda tecnica NEST')
    // Same hand-counted numbers as the full import test above.
    expect(preview.counts).toEqual({ productLines: 5, characteristics: 5, options: 12, priceTables: 5, relations: 11, images: 3 })
    expect(preview.warnings).toEqual([])
    expect(await familyCount()).toBe(before)
  })

  it('rejects a file that is not a workbook in the preview already', async () => {
    await expect(previewProductFamilyImport({ buffer: Buffer.from('nope'), originalName: 'x.xlsx' })).rejects.toThrow(ExcelImportError)
  })

  it('saves the name, validity dates and publish choice from the dialog, and records them on the import audit entry', async () => {
    const family = await importProductFamilyFromExcel(
      ctx(),
      actor,
      supplierCompanyId,
      { buffer: fixtureBuffer, originalName: 'product-family-sample.xlsx' },
      { name: '  NEST 2027  ', priceValidFrom: '2027-01-01', priceValidTo: '2027-12-31', publish: true, readyForInvoicing: true },
    )
    expect(family).toMatchObject({
      name: 'NEST 2027',
      priceValidFrom: '2027-01-01',
      priceValidTo: '2027-12-31',
      isPublished: true,
      readyForInvoicing: true,
    })

    const entries = await withSystemTransaction(db, (tx) =>
      tx.select().from(auditLog).where(and(eq(auditLog.resourceType, 'product_family'), eq(auditLog.resourceId, family.id))),
    )
    expect(entries.map((entry) => entry.action)).toEqual(['product_family.import'])
    expect(entries[0].metadata).toMatchObject({ priceValidFrom: '2027-01-01', priceValidTo: '2027-12-31', published: true, readyForInvoicing: true })
  })

  it('gives a new version its own dates and leaves the older version untouched', async () => {
    const v1 = await importProductFamilyFromExcel(
      ctx(),
      actor,
      supplierCompanyId,
      { buffer: fixtureBuffer, originalName: 'v1.xlsx' },
      { priceValidFrom: '2026-01-01', priceValidTo: '2026-12-31' },
    )
    const v2 = await createNewVersionFromExcel(ctx(), actor, v1.id, { buffer: fixtureBuffer, originalName: 'v2.xlsx' }, { priceValidFrom: '2027-01-01' })

    expect(v2).toMatchObject({ version: v1.version + 1, priceValidFrom: '2027-01-01', priceValidTo: null, isPublished: false })
    const v1After = await getProductFamilyDetail(ctx(), v1.id)
    expect(v1After!.family).toMatchObject({ priceValidFrom: '2026-01-01', priceValidTo: '2026-12-31' })
  })

  it('refuses a new version whose dates share a day with another version, and saves nothing', async () => {
    const v1 = await importProductFamilyFromExcel(
      ctx(),
      actor,
      supplierCompanyId,
      { buffer: fixtureBuffer, originalName: 'v1.xlsx' },
      { priceValidFrom: '2026-01-01', priceValidTo: null },
    )
    const upload = { buffer: fixtureBuffer, originalName: 'v2.xlsx' }
    await expect(createNewVersionFromExcel(ctx(), actor, v1.id, upload, { priceValidFrom: '2027-01-01' })).rejects.toThrow(PriceValidityOverlapError)
    expect((await getProductFamilyVersions(ctx(), v1.id))!.versions).toHaveLength(1)

    await setProductFamilyPriceValidityDates(ctx(), actor, v1.id, { priceValidFrom: '2026-01-01', priceValidTo: '2026-12-31' })
    // The last day of v1 is still taken.
    await expect(createNewVersionFromExcel(ctx(), actor, v1.id, upload, { priceValidFrom: '2026-12-31' })).rejects.toThrow('overlap version 1')
    await expect(createNewVersionFromExcel(ctx(), actor, v1.id, upload, { priceValidFrom: '2027-01-01' })).resolves.toMatchObject({ version: 2 })
  })

  it('counts a version without dates as valid every day', async () => {
    const legacy = await importProductFamilyFromExcel(ctx(), actor, supplierCompanyId, { buffer: fixtureBuffer, originalName: 'v1.xlsx' })
    const upload = { buffer: fixtureBuffer, originalName: 'v2.xlsx' }
    await expect(createNewVersionFromExcel(ctx(), actor, legacy.id, upload, { priceValidFrom: '2030-01-01' })).rejects.toThrow(PriceValidityOverlapError)

    await setProductFamilyPriceValidityDates(ctx(), actor, legacy.id, { priceValidFrom: '2020-01-01', priceValidTo: '2029-12-31' })
    await expect(createNewVersionFromExcel(ctx(), actor, legacy.id, upload, { priceValidFrom: '2030-01-01' })).resolves.toMatchObject({ version: 2 })
  })

  it('refuses changing a version to dates another version already covers, keeping the old dates', async () => {
    const v1 = await importProductFamilyFromExcel(
      ctx(),
      actor,
      supplierCompanyId,
      { buffer: fixtureBuffer, originalName: 'v1.xlsx' },
      { priceValidFrom: '2026-01-01', priceValidTo: '2026-06-30' },
    )
    const v2 = await createNewVersionFromExcel(ctx(), actor, v1.id, { buffer: fixtureBuffer, originalName: 'v2.xlsx' }, { priceValidFrom: '2026-07-01', priceValidTo: '2026-12-31' })

    await expect(setProductFamilyPriceValidityDates(ctx(), actor, v1.id, { priceValidFrom: '2026-01-01', priceValidTo: null })).rejects.toThrow(
      PriceValidityOverlapError,
    )
    await expect(setProductFamilyPriceValidityDates(ctx(), actor, v2.id, { priceValidFrom: '2026-06-15', priceValidTo: '2026-12-31' })).rejects.toThrow(
      'overlap version 1',
    )
    expect((await getProductFamilyDetail(ctx(), v1.id))!.family).toMatchObject({ priceValidFrom: '2026-01-01', priceValidTo: '2026-06-30' })
    expect((await getProductFamilyDetail(ctx(), v2.id))!.family).toMatchObject({ priceValidFrom: '2026-07-01', priceValidTo: '2026-12-31' })

    // Moving a version within its own days is fine.
    await setProductFamilyPriceValidityDates(ctx(), actor, v2.id, { priceValidFrom: '2026-08-01', priceValidTo: null })
    expect((await getProductFamilyDetail(ctx(), v2.id))!.family).toMatchObject({ priceValidFrom: '2026-08-01', priceValidTo: null })
  })

  it('starts a new family not ready for invoicing; only the owner changes it, and each change is audited', async () => {
    const family = await importProductFamilyFromExcel(ctx(), actor, supplierCompanyId, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })
    expect(family.readyForInvoicing).toBe(false)

    await setProductFamilyReadyForInvoicingStatus(ctx(), actor, family.id, true)
    expect((await getProductFamilyDetail(ctx(), family.id))!.family.readyForInvoicing).toBe(true)

    const stranger = { effectiveCompanyId: '00000000-0000-4000-8000-000000000000', isSuperAdmin: false }
    await expect(setProductFamilyReadyForInvoicingStatus(stranger, actor, family.id, false)).rejects.toThrow(ProductFamilyNotFoundError)
    expect((await getProductFamilyDetail(ctx(), family.id))!.family.readyForInvoicing).toBe(true)

    await setProductFamilyReadyForInvoicingStatus(ctx(), actor, family.id, false)
    const entries = await withSystemTransaction(db, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.resourceType, 'product_family'), eq(auditLog.resourceId, family.id)))
        .orderBy(auditLog.createdAt),
    )
    expect(entries.map((entry) => entry.action)).toEqual([
      'product_family.import',
      'product_family.ready_for_invoicing',
      'product_family.not_ready_for_invoicing',
    ])
  })

  it('sets "with price list" for the owner only, records it, and a copy keeps it', async () => {
    const family = await importProductFamilyFromExcel(ctx(), actor, supplierCompanyId, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })
    expect(family.hasPriceList).toBe(true)

    await setProductFamilyHasPriceListStatus(ctx(), actor, family.id, false)
    expect((await getProductFamilyDetail(ctx(), family.id))!.family.hasPriceList).toBe(false)

    const stranger = { effectiveCompanyId: '00000000-0000-4000-8000-000000000000', isSuperAdmin: false }
    await expect(setProductFamilyHasPriceListStatus(stranger, actor, family.id, true)).rejects.toThrow(ProductFamilyNotFoundError)

    const copy = await duplicateProductFamily(ctx(), actor, family.id, {
      name: 'No price list copy',
      priceValidFrom: '2027-01-01',
      priceValidTo: null,
      publish: false,
      readyForInvoicing: false,
    })
    expect(copy.hasPriceList).toBe(false)
    // Set by hand, so a new version keeps it too.
    const v2 = await createNewVersionFromExcel(ctx(), actor, family.id, { buffer: fixtureBuffer, originalName: 'v2.xlsx' })
    expect(v2.hasPriceList).toBe(false)

    const entries = await withSystemTransaction(db, (tx) =>
      tx.select().from(auditLog).where(and(eq(auditLog.resourceType, 'product_family'), eq(auditLog.resourceId, family.id))),
    )
    expect(entries.map((entry) => entry.action)).toContain('product_family.price_list_unset')
  })

  it('changes the dates later for the owner only', async () => {
    const family = await importProductFamilyFromExcel(ctx(), actor, supplierCompanyId, {
      buffer: fixtureBuffer,
      originalName: 'product-family-sample.xlsx',
    })
    expect(family).toMatchObject({ priceValidFrom: null, priceValidTo: null })

    await setProductFamilyPriceValidityDates(ctx(), actor, family.id, { priceValidFrom: '2026-02-01', priceValidTo: '2026-06-30' })
    expect((await getProductFamilyDetail(ctx(), family.id))!.family).toMatchObject({ priceValidFrom: '2026-02-01', priceValidTo: '2026-06-30' })

    const stranger = { effectiveCompanyId: '00000000-0000-4000-8000-000000000000', isSuperAdmin: false }
    await expect(
      setProductFamilyPriceValidityDates(stranger, actor, family.id, { priceValidFrom: '2026-01-01', priceValidTo: null }),
    ).rejects.toThrow(ProductFamilyNotFoundError)
  })
})
