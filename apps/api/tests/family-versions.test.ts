process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { auditLog, companies, createDb, productFamilyChanges, productFamilyShares, productLines, roles, users, withSystemTransaction } from '@schuco/db'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../src/lib/db'
import {
  compareProductFamilyVersions,
  createNewVersionFromExcel,
  duplicateProductFamily,
  getProductFamilyDetail,
  getProductFamilyVersions,
  importProductFamilyFromExcel,
  setProductFamilyPublishedStatus,
} from '../src/services/product-families-service'

/**
 * The version timeline and version comparison, over a real three-version chain:
 * v1 and v2 are the same workbook, v3 has one line removed and another line's
 * markup and description changed. A client the supplier shared v1 and v3 with
 * (v2 stays a draft) must only see — and only compare — those two.
 */

const fixture = { buffer: readFileSync(join(__dirname, 'fixtures/product-family-sample.xlsx')), originalName: 'product-family-sample.xlsx' }
const actor = { actorUserId: '', actorCompanyId: '', requestId: 'test-request' }
let supplierId = ''
let clientId = ''
let actorUserId = ''
const ids = { v1: '', v2: '', v3: '', other: '', copy: '', copyV2: '' }

const supplierCtx = () => ({ effectiveCompanyId: supplierId, isSuperAdmin: false })
const clientCtx = () => ({ effectiveCompanyId: clientId, isSuperAdmin: false })

beforeAll(async () => {
  await withSystemTransaction(getDb(), async (tx) => {
    await tx.insert(roles).values({ id: 'company-admin', name: 'Company Admin', description: 'test role' }).onConflictDoNothing({ target: roles.id })
    const [supplier] = await tx
      .insert(companies)
      .values({ isManufacturer: true, isSupplier: true, name: 'Family Versions Test Supplier', vatNumber: 'FV-SUP' })
      .returning({ id: companies.id })
    const [client] = await tx
      .insert(companies)
      .values({ isClient: true, name: 'Family Versions Test Client', vatNumber: 'FV-CLI' })
      .returning({ id: companies.id })
    supplierId = supplier.id
    clientId = client.id
    const [user] = await tx
      .insert(users)
      .values({ cognitoSub: 'family-versions-test', email: 'family-versions-test@example.com', companyId: supplierId, roleId: 'company-admin', status: 'active' })
      .returning({ id: users.id })
    actorUserId = user.id
  })
  actor.actorUserId = actorUserId
  actor.actorCompanyId = supplierId

  const v1 = await importProductFamilyFromExcel(supplierCtx(), actor, supplierId, fixture)
  const v2 = await createNewVersionFromExcel(supplierCtx(), actor, v1.id, fixture)
  const v3 = await createNewVersionFromExcel(supplierCtx(), actor, v1.id, fixture)
  const other = await importProductFamilyFromExcel(supplierCtx(), actor, supplierId, fixture)
  // A copy of v2 with its own second version: a branch of the graph.
  const copy = await duplicateProductFamily(supplierCtx(), actor, v2.id, { name: 'Copy of v2', priceValidFrom: '2026-01-01', priceValidTo: null, publish: false, readyForInvoicing: false })
  const copyV2 = await createNewVersionFromExcel(supplierCtx(), actor, copy.id, fixture)
  Object.assign(ids, { v1: v1.id, v2: v2.id, v3: v3.id, other: other.id, copy: copy.id, copyV2: copyV2.id })

  const v3Lines = (await getProductFamilyDetail(supplierCtx(), v3.id))!.lines.sort((a, b) => a.sortOrder - b.sortOrder)
  await withSystemTransaction(getDb(), async (tx) => {
    await tx.update(productLines).set({ markupPct: '123', description: 'Changed in v3' }).where(eq(productLines.id, v3Lines[0].id))
    await tx.delete(productLines).where(eq(productLines.id, v3Lines[1].id))
    // Edited behind the services' back, so the change list stored at import no longer fits.
    await tx.delete(productFamilyChanges).where(eq(productFamilyChanges.productFamilyId, v3.id))
    await tx.insert(productFamilyShares).values([
      { productFamilyId: v1.id, fromCompanyId: supplierId, toCompanyId: clientId },
      { productFamilyId: v3.id, fromCompanyId: supplierId, toCompanyId: clientId },
    ])
  })
  await setProductFamilyPublishedStatus(supplierCtx(), actor, v1.id, true)
  await setProductFamilyPublishedStatus(supplierCtx(), actor, v3.id, true)
})

afterAll(async () => {
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
  await superuserDb.delete(auditLog).where(inArray(auditLog.effectiveCompanyId, [supplierId]))
  await withSystemTransaction(getDb(), async (tx) => {
    await tx.delete(users).where(eq(users.id, actorUserId))
    await tx.delete(companies).where(inArray(companies.id, [supplierId, clientId]))
  })
})

const V3_CHANGES = { added: 0, removed: 1, economic: 1, description: 1 }

describe('getProductFamilyVersions', () => {
  it('lists the whole chain oldest first from any version, without comparing unless asked', async () => {
    const result = await getProductFamilyVersions(supplierCtx(), ids.v2)
    expect(result!.versions.map((v) => v.version)).toEqual([1, 2, 3])
    expect(result!.steps).toEqual([])
    expect(result!.origin).toBeNull()
    expect(result!.branches).toEqual([{ forkFromId: ids.v2, versions: [expect.objectContaining({ id: ids.copy }), expect.objectContaining({ id: ids.copyV2 })] }])
    expect(result!.edges).toEqual([
      { fromId: ids.v1, toId: ids.v2 },
      { fromId: ids.v2, toId: ids.v3 },
      { fromId: ids.v2, toId: ids.copy },
      { fromId: ids.copy, toId: ids.copyV2 },
    ])
  })

  it('leaves the copies out when asked for the chain only', async () => {
    const result = await getProductFamilyVersions(supplierCtx(), ids.v2, { withBranches: false })
    expect(result!.versions.map((v) => v.version)).toEqual([1, 2, 3])
    expect(result!.branches).toEqual([])
  })

  it('shows a copy with the version it was copied from as its origin', async () => {
    const result = await getProductFamilyVersions(supplierCtx(), ids.copyV2)
    expect(result!.versions.map((v) => v.id)).toEqual([ids.copy, ids.copyV2])
    expect(result!.origin).toMatchObject({ id: ids.v2, version: 2 })
    expect(result!.branches).toEqual([])
  })

  it('adds the changes between neighbours when asked', async () => {
    const result = await getProductFamilyVersions(supplierCtx(), ids.v2, { withSteps: true })
    expect(result!.steps).toEqual([
      { fromId: ids.v1, toId: ids.v2, counts: { added: 0, removed: 0, economic: 0, description: 0 } },
      { fromId: ids.v2, toId: ids.v3, counts: V3_CHANGES },
      // The copy got a new name and validity; its own v2 is a fresh import of the workbook again.
      { fromId: ids.v2, toId: ids.copy, counts: expect.objectContaining({ added: 0, removed: 0 }) },
      { fromId: ids.copy, toId: ids.copyV2, counts: expect.objectContaining({ added: 0, removed: 0 }) },
    ])
  })

  it('shows a client only the versions shared with it, stepping over the draft in between', async () => {
    const result = await getProductFamilyVersions(clientCtx(), ids.v3, { withSteps: true })
    expect(result!.versions.map((v) => v.version)).toEqual([1, 3])
    // The unpublished copy isn't shared with the client either.
    expect(result!.branches).toEqual([])
    expect(result!.steps).toEqual([{ fromId: ids.v1, toId: ids.v3, counts: V3_CHANGES }])
  })

  it('is null for a version the caller cannot see', async () => {
    expect(await getProductFamilyVersions(clientCtx(), ids.v2)).toBeNull()
  })
})

describe('compareProductFamilyVersions', () => {
  it('always compares older → newer and classifies each change', async () => {
    const result = await compareProductFamilyVersions(supplierCtx(), ids.v3, ids.v1)
    expect(result!.from.version).toBe(1)
    expect(result!.to.version).toBe(3)
    expect(result!.counts).toEqual(V3_CHANGES)

    const lines = result!.changes.find((node) => node.type === 'section' && node.id === 'lines')
    expect(lines?.type === 'section' && lines.children.map((item) => (item.type === 'item' ? item.kind ?? 'changed' : item.type))).toEqual([
      'changed',
      'removed',
    ])
  })

  it('compares a copy with a version of its original from either side', async () => {
    // v1 is in v2's chain but not the copy's own graph (that only reaches v2): found from v1's side.
    const fromCopy = await compareProductFamilyVersions(supplierCtx(), ids.copyV2, ids.v1)
    const fromOriginal = await compareProductFamilyVersions(supplierCtx(), ids.v1, ids.copyV2)
    expect(fromCopy).toEqual(fromOriginal)
    expect(fromCopy!.from.id).toBe(ids.v1)
  })

  it('compares a copy with its original', async () => {
    const result = await compareProductFamilyVersions(supplierCtx(), ids.copy, ids.v2)
    expect(result!.from).toMatchObject({ id: ids.v2, version: 2 })
    expect(result!.to).toMatchObject({ id: ids.copy, name: 'Copy of v2' })
    expect(result!.counts.description).toBeGreaterThan(0) // the new name
  })

  it('refuses a version the caller cannot see and a version of another family', async () => {
    expect(await compareProductFamilyVersions(clientCtx(), ids.v1, ids.v2)).toBeNull()
    expect(await compareProductFamilyVersions(supplierCtx(), ids.v1, ids.other)).toBeNull()
  })
})
