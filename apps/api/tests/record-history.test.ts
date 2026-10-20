process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { auditLog, companies, createDb, productFamilies, productFamilyShares, quotes, withSystemTransaction, type Db } from '@schuco/db'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../src/lib/db'
import { InvalidAuditCursorError } from '../src/services/audit-service'
import { ProductFamilyHistoryForbiddenError, getProductFamilyHistory } from '../src/services/product-families-service'
import { getQuoteHistory } from '../src/services/quotes-service'

/**
 * Service-layer test (ADR 0012) for the per-record history panels: who may see
 * a quote's / product family's history, and that a family's history includes
 * item edits recorded the old way (under the item's id).
 */

let db: Db
let owner: string
let sharedWith: string
let stranger: string
let quoteId: string
let otherQuoteId: string
let familyId: string
let otherFamilyId: string

const asCompany = (companyId: string) => ({ effectiveCompanyId: companyId, isSuperAdmin: false })
const page = { limit: 20 }

beforeAll(async () => {
  db = getDb()
  await withSystemTransaction(db, async (tx) => {
    const rows = await tx
      .insert(companies)
      .values([
        { isManufacturer: true, isSupplier: true, name: 'History Owner', vatNumber: 'HIST-OWNER' },
        { isSupplier: true, name: 'History Shared With', vatNumber: 'HIST-SHARED' },
        { isClient: true, name: 'History Stranger', vatNumber: 'HIST-STRANGER' },
      ])
      .returning({ id: companies.id })
    ;[owner, sharedWith, stranger] = rows.map((row) => row.id)

    const quoteRows = await tx
      .insert(quotes)
      .values([
        { supplierCompanyId: owner, reference: 'HIST-Q1', customerName: 'Customer' },
        { supplierCompanyId: owner, reference: 'HIST-Q2', customerName: 'Customer' },
      ])
      .returning({ id: quotes.id })
    ;[quoteId, otherQuoteId] = quoteRows.map((row) => row.id)

    const familyRows = await tx
      .insert(productFamilies)
      .values([
        { supplierCompanyId: owner, name: 'History Family', isPublished: true },
        { supplierCompanyId: owner, name: 'Other Family', isPublished: true },
      ])
      .returning({ id: productFamilies.id })
    ;[familyId, otherFamilyId] = familyRows.map((row) => row.id)
    await tx.insert(productFamilyShares).values({ productFamilyId: familyId, fromCompanyId: owner, toCompanyId: sharedWith })

    const base = { actorType: 'user' as const, effectiveCompanyId: owner }
    await tx.insert(auditLog).values([
      { ...base, action: 'quote.create', resourceType: 'quote', resourceId: quoteId, metadata: { reference: 'HIST-Q1' }, createdAt: new Date('2026-05-01T09:00:00Z') },
      { ...base, action: 'quote.add_position', resourceType: 'quote', resourceId: quoteId, metadata: { positionCode: 'P01', productLineId: 'internal-id' }, requestId: 'req-secret', createdAt: new Date('2026-05-01T09:05:00Z') },
      { ...base, action: 'quote.create', resourceType: 'quote', resourceId: otherQuoteId },
      { ...base, action: 'product_family.import', resourceType: 'product_family', resourceId: familyId },
      // Old shape: filed under the line's id, family id only in the metadata.
      {
        ...base,
        action: 'product_family.line_update',
        resourceType: 'product_family',
        resourceId: '11111111-1111-4111-8111-111111111111',
        metadata: { productFamilyId: familyId, changed: ['value'] },
      },
      // New shape: filed under the family, item in the metadata.
      {
        ...base,
        action: 'product_family.matrix_update',
        resourceType: 'product_family',
        resourceId: familyId,
        metadata: { productFamilyId: familyId, itemType: 'matrix', itemId: '22222222-2222-4222-8222-222222222222', changed: ['matrix'] },
      },
      { ...base, action: 'product_family.import', resourceType: 'product_family', resourceId: otherFamilyId },
    ])
  })
})

afterAll(async () => {
  // audit_log is append-only for the app role (ADR 0010) — cleanup needs the superuser connection.
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
  await superuserDb.delete(auditLog).where(inArray(auditLog.effectiveCompanyId, [owner, sharedWith, stranger]))
  await superuserDb.$client.end()
  await withSystemTransaction(db, async (tx) => {
    await tx.delete(quotes).where(inArray(quotes.supplierCompanyId, [owner]))
    await tx.delete(productFamilies).where(inArray(productFamilies.supplierCompanyId, [owner]))
    await tx.delete(companies).where(inArray(companies.id, [owner, sharedWith, stranger]))
  })
})

describe('getQuoteHistory', () => {
  it("returns only that quote's entries, newest first", async () => {
    const history = await getQuoteHistory(asCompany(owner), quoteId, page)
    expect(history?.entries.map((entry) => entry.action)).toEqual(['quote.add_position', 'quote.create'])
  })

  it('shows only what the panel needs — no request ids or raw metadata', async () => {
    const history = await getQuoteHistory(asCompany(owner), quoteId, page)
    const added = history?.entries.find((entry) => entry.action === 'quote.add_position')
    expect(added?.requestId).toBeNull()
    expect(added?.metadata).toEqual({ positionCode: 'P01' })
  })

  it('returns null for a quote the caller cannot see', async () => {
    expect(await getQuoteHistory(asCompany(stranger), quoteId, page)).toBeNull()
  })

  it('rejects a cursor it did not issue', async () => {
    await expect(getQuoteHistory(asCompany(owner), quoteId, { limit: 20, cursor: 'garbage' })).rejects.toThrow(InvalidAuditCursorError)
  })
})

describe('getProductFamilyHistory', () => {
  it('includes item edits recorded under the item id (old) and under the family id (new)', async () => {
    const history = await getProductFamilyHistory(asCompany(owner), familyId, page)
    expect(history?.entries.map((entry) => entry.action).sort()).toEqual(
      ['product_family.import', 'product_family.line_update', 'product_family.matrix_update'].sort(),
    )
  })

  it('is visible to a super-admin', async () => {
    const history = await getProductFamilyHistory({ effectiveCompanyId: stranger, isSuperAdmin: true }, familyId, page)
    expect(history?.entries).toHaveLength(3)
  })

  it('is refused to a company the family was only shared with', async () => {
    await expect(getProductFamilyHistory(asCompany(sharedWith), familyId, page)).rejects.toThrow(ProductFamilyHistoryForbiddenError)
  })

  it('returns null for a family the caller cannot see at all', async () => {
    expect(await getProductFamilyHistory(asCompany(stranger), familyId, page)).toBeNull()
  })
})
