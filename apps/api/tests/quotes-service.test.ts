process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  auditLog,
  companies,
  createDb,
  quotes,
  roles,
  supplierClientLinks,
  users,
  withSystemTransaction,
  type Db,
} from '@schuco/db'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../src/lib/db'
import { renderQuotePdf } from '../src/lib/quote-pdf'
import {
  getProductFamilyDetail,
  importProductFamilyFromExcel,
  setProductFamilyPublishedStatus,
} from '../src/services/product-families-service'
import {
  QuoteValidationError,
  addQuotePosition,
  createQuote,
  duplicatePosition,
  getQuote,
  listMyQuotes,
  removeQuotePosition,
  reorderPositions,
} from '../src/services/quotes-service'

/**
 * Service-layer test (ADR 0012): builds a real quote — imports the real
 * supplier workbook, adds a priced position against it (matrix-priced
 * line + a characteristic selection), and checks the numbers match what
 * the pricing tests already verified by hand for this fixture at
 * width=1000/height=800 (line 555, discount 43%, markup 150%).
 */

let db: Db
let supplierCompanyId: string
let actorUserId: string
let linkedClientCompanyId: string
const fixtureBuffer = readFileSync(join(__dirname, 'fixtures/product-family-sample.xlsx'))
const actor = { actorUserId: '', actorCompanyId: '', requestId: 'test-request' }

const ctx = () => ({ effectiveCompanyId: supplierCompanyId, isSuperAdmin: false })
const importFreshFamily = () =>
  importProductFamilyFromExcel(ctx(), actor, supplierCompanyId, {
    buffer: fixtureBuffer,
    originalName: 'product-family-sample.xlsx',
  })
const matrixLineOf = async (familyId: string) => {
  const detail = await getProductFamilyDetail(ctx(), familyId)
  return detail!.lines.find((l) => l.name.startsWith('N95 L'))!
}

beforeAll(async () => {
  db = getDb()
  await withSystemTransaction(db, async (tx) => {
    await tx
      .insert(roles)
      .values({ id: 'company-admin', name: 'Company Admin', description: 'test role' })
      .onConflictDoNothing({ target: roles.id })

    const [company] = await tx
      .insert(companies)
      .values({ type: 'supplier', name: 'Quote Service Test Supplier', vatNumber: 'QSVC-SUP' })
      .returning({ id: companies.id })
    supplierCompanyId = company.id
    actor.actorCompanyId = supplierCompanyId

    const [user] = await tx
      .insert(users)
      .values({
        cognitoSub: 'quote-svc-test-actor',
        email: 'quote-svc-test-actor@example.com',
        companyId: supplierCompanyId,
        roleId: 'company-admin',
        status: 'active',
      })
      .returning({ id: users.id })
    actorUserId = user.id
    actor.actorUserId = actorUserId

    // A company linked as this supplier's client — RLS lets it SELECT the
    // supplier's *published* families (app_can_view_product_family), which
    // is exactly the gap addQuotePosition's ownership check guards against.
    const [linkedClient] = await tx
      .insert(companies)
      .values({ type: 'client', name: 'Quote Service Test Linked Client', vatNumber: 'QSVC-CLIENT' })
      .returning({ id: companies.id })
    linkedClientCompanyId = linkedClient.id
    await tx.insert(supplierClientLinks).values({ supplierCompanyId, clientCompanyId: linkedClientCompanyId })
  })
})

afterAll(async () => {
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
  await superuserDb
    .delete(auditLog)
    .where(inArray(auditLog.effectiveCompanyId, [supplierCompanyId, linkedClientCompanyId]))

  await withSystemTransaction(db, async (tx) => {
    // Quotes must go first: quote_positions.product_family_id is RESTRICT, and a
    // single company delete fires the quotes-cascade and product_families-cascade
    // in an order Postgres doesn't guarantee, so deleting quotes explicitly here
    // avoids a transient FK violation during company cleanup.
    await tx.delete(quotes).where(inArray(quotes.supplierCompanyId, [supplierCompanyId, linkedClientCompanyId]))
    await tx.delete(users).where(inArray(users.id, [actorUserId]))
    await tx.delete(companies).where(inArray(companies.id, [supplierCompanyId, linkedClientCompanyId]))
  })
})

describe('createQuote + addQuotePosition', () => {
  it('prices a matrix-based line at a given size using the same costing engine as the catalog, and totals correctly', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)

    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-1', customerName: 'Test Customer' })
    expect(quote.status).toBe('draft')
    expect(quote.totalPrice).toBe('0.00')

    const afterAdd = await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
    })

    expect(afterAdd.positions).toHaveLength(1)
    const position = afterAdd.positions[0]
    expect(position.positionCode).toBe('P01')
    expect(position.productFamilyName).toBe(family.name)
    expect(position.productLineName).toBe(line.name)
    // Matrix lookup at 1000x800 = 555 (verified by hand for this fixture — see product-costing.test.ts).
    expect(position.basePrice).toBe('555.00')
    // 555 * (1 - 43/100) * (150/100) = 474.525 -> the line's own catalog discount/markup, used as the position's default.
    expect(Number(position.finalPrice)).toBeCloseTo(474.53, 1)

    expect(afterAdd.quote.totalPrice).toBe(position.finalPrice)
  })

  it("layers a characteristic selection's price on top of the line price, using the line price as valore_base_in_vendita", async () => {
    const family = await importFreshFamily()
    const familyDetail = await getProductFamilyDetail(ctx(), family.id)
    const line = await matrixLineOf(family.id)
    const main = familyDetail!.characteristics.find((c) => !c.parentId)!
    const sub = familyDetail!.characteristics.find((c) => c.parentId === main.id)!

    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-2', customerName: 'Test Customer' })
    const afterAdd = await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 2,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [{ characteristicId: main.id, subCharacteristicId: sub.id }],
    })

    const position = afterAdd.positions[0]
    expect(position.characteristics).toHaveLength(1)
    expect(position.characteristics[0].characteristicName).toBe(main.name)
    expect(position.characteristics[0].subCharacteristicName).toBe(sub.name)
    // quantity=2, so basePrice reflects 2 units of (line + characteristic) — strictly more than 2 units of the line alone.
    expect(Number(position.basePrice)).toBeGreaterThan(555 * 2)
  })

  it('pricingMode "manual" on the line replaces the formula/matrix price with manualUnitPrice (the reference app\'s "A"/"M" toggle)', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)

    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-MANUAL-1', customerName: 'Test Customer' })
    const afterAdd = await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
      pricingMode: 'manual',
      manualUnitPrice: 999,
      discountPct: 0,
      extraMarkupPct: 100,
    })

    const position = afterAdd.positions[0]
    // 999, NOT the matrix's 555 — manual bypasses the formula/matrix entirely.
    expect(position.basePrice).toBe('999.00')
    expect(position.finalPrice).toBe('999.00')
    expect(position.pricingMode).toBe('manual')
    expect(position.lineManualUnitPrice).toBe('999.0000')
  })

  it('pricingMode "manual" on one characteristic selection overrides only that selection\'s price, independent of the line\'s own (still auto) price', async () => {
    const family = await importFreshFamily()
    const familyDetail = await getProductFamilyDetail(ctx(), family.id)
    const line = await matrixLineOf(family.id)
    const main = familyDetail!.characteristics.find((c) => !c.parentId)!
    const sub = familyDetail!.characteristics.find((c) => c.parentId === main.id)!

    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-MANUAL-2', customerName: 'Test Customer' })
    const afterAdd = await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [
        { characteristicId: main.id, subCharacteristicId: sub.id, pricingMode: 'manual', manualUnitPrice: 50 },
      ],
      discountPct: 0,
      extraMarkupPct: 100,
    })

    const position = afterAdd.positions[0]
    expect(position.characteristics[0].pricingMode).toBe('manual')
    expect(position.characteristics[0].price).toBe('50.00')
    // Line stays auto-priced at the matrix's 555; only the characteristic was overridden.
    expect(position.basePrice).toBe('605.00')
  })

  it('rejects pricingMode "manual" without a manualUnitPrice, or with a negative one, instead of silently falling back to 0', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-MANUAL-3', customerName: 'Test Customer' })

    await expect(
      addQuotePosition(ctx(), actor, quote.id, {
        productFamilyId: family.id,
        productLineId: line.id,
        quantity: 1,
        widthMm: 1000,
        heightMm: 800,
        characteristicSelections: [],
        pricingMode: 'manual',
      }),
    ).rejects.toThrow(QuoteValidationError)

    await expect(
      addQuotePosition(ctx(), actor, quote.id, {
        productFamilyId: family.id,
        productLineId: line.id,
        quantity: 1,
        widthMm: 1000,
        heightMm: 800,
        characteristicSelections: [],
        pricingMode: 'manual',
        manualUnitPrice: -10,
      }),
    ).rejects.toThrow(QuoteValidationError)
  })

  it('duplicatePosition preserves manual pricing (line and characteristic) on the copy', async () => {
    const family = await importFreshFamily()
    const familyDetail = await getProductFamilyDetail(ctx(), family.id)
    const line = await matrixLineOf(family.id)
    const main = familyDetail!.characteristics.find((c) => !c.parentId)!
    const sub = familyDetail!.characteristics.find((c) => c.parentId === main.id)!

    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-MANUAL-4', customerName: 'Test Customer' })
    const afterAdd = await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [
        { characteristicId: main.id, subCharacteristicId: sub.id, pricingMode: 'manual', manualUnitPrice: 50 },
      ],
      pricingMode: 'manual',
      manualUnitPrice: 999,
    })

    const afterDuplicate = await duplicatePosition(ctx(), actor, quote.id, afterAdd.positions[0].id)
    const copy = afterDuplicate.positions[1]
    expect(copy.pricingMode).toBe('manual')
    expect(copy.lineManualUnitPrice).toBe('999.0000')
    expect(copy.characteristics[0].pricingMode).toBe('manual')
  })

  it('rejects an out-of-range size instead of silently mispricing', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-3', customerName: 'Test Customer' })

    await expect(
      addQuotePosition(ctx(), actor, quote.id, {
        productFamilyId: family.id,
        productLineId: line.id,
        quantity: 1,
        widthMm: 99999,
        heightMm: 99999,
        characteristicSelections: [],
      }),
    ).rejects.toThrow(QuoteValidationError)
  })

  it('re-numbers position codes and sortOrder from what actually survives, not positions.length (remove-then-add must not collide)', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-RENUMBER', customerName: 'Test Customer' })

    const addOne = () =>
      addQuotePosition(ctx(), actor, quote.id, {
        productFamilyId: family.id,
        productLineId: line.id,
        quantity: 1,
        widthMm: 1000,
        heightMm: 800,
        characteristicSelections: [],
      })

    const afterP1 = await addOne()
    const afterP2 = await addOne()
    const afterP3 = await addOne()
    expect(afterP3.positions.map((p) => p.positionCode)).toEqual(['P01', 'P02', 'P03'])

    // Remove the middle one, then add a new position — it must not reissue "P03".
    await removeQuotePosition(ctx(), actor, quote.id, afterP2.positions[1].id)
    const afterReAdd = await addOne()

    const codes = afterReAdd.positions.map((p) => p.positionCode)
    expect(new Set(codes).size).toBe(codes.length)
    const sortOrders = afterReAdd.positions.map((p) => p.sortOrder)
    expect(new Set(sortOrders).size).toBe(sortOrders.length)
  })

  it("rejects quoting from a product family owned by a different company, even one the caller can SELECT via RLS as a linked client", async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    // Publish it so the linked client's RLS visibility (app_can_view_product_family) actually grants SELECT —
    // this is the exact condition addQuotePosition's ownership check must still reject.
    await setProductFamilyPublishedStatus(ctx(), actor, family.id, true)

    const clientCtx = { effectiveCompanyId: linkedClientCompanyId, isSuperAdmin: false }
    const clientActor = { actorUserId, actorCompanyId: linkedClientCompanyId, requestId: 'test-request' }
    // Confirm RLS does grant this company SELECT on the supplier's published family (otherwise this test wouldn't exercise the gap).
    expect(await getProductFamilyDetail(clientCtx, family.id)).not.toBeNull()

    const clientQuote = await createQuote(clientCtx, clientActor, {
      reference: 'TEST-Q-SVC-CROSS-TENANT',
      customerName: 'Test Customer',
    })

    await expect(
      addQuotePosition(clientCtx, clientActor, clientQuote.id, {
        productFamilyId: family.id,
        productLineId: line.id,
        quantity: 1,
        widthMm: 1000,
        heightMm: 800,
        characteristicSelections: [],
      }),
    ).rejects.toThrow(QuoteValidationError)
  })

  it('a super-admin acting as another tenant (X-Tenant-Id) cannot price from a family that tenant does not own', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)

    // Super-admin acting AS linkedClientCompanyId — isSuperAdmin stays true (ADR 0008),
    // but effectiveCompanyId is the client, not the supplier who owns `family`.
    const superAdminActingAsClient = { effectiveCompanyId: linkedClientCompanyId, isSuperAdmin: true }
    const superAdminActor = { actorUserId, actorCompanyId: linkedClientCompanyId, requestId: 'test-request' }

    const quote = await createQuote(superAdminActingAsClient, superAdminActor, {
      reference: 'TEST-Q-SVC-SUPERADMIN-CROSS-TENANT',
      customerName: 'Test Customer',
    })

    await expect(
      addQuotePosition(superAdminActingAsClient, superAdminActor, quote.id, {
        productFamilyId: family.id,
        productLineId: line.id,
        quantity: 1,
        widthMm: 1000,
        heightMm: 800,
        characteristicSelections: [],
      }),
    ).rejects.toThrow(QuoteValidationError)
  })

  it('createQuote ignores server-owned fields in the input instead of letting them override the caller/company', async () => {
    const maliciousInput = {
      reference: 'TEST-Q-SVC-ALLOWLIST',
      customerName: 'Test Customer',
      // None of these are declared on CreateQuoteInput, but nothing stops
      // a raw request body from including them (the route does no Zod
      // parse) — insertQuote must never let them win over the safe values.
      supplierCompanyId: '00000000-0000-0000-0000-000000000000',
      createdByUserId: '00000000-0000-0000-0000-000000000000',
      status: 'accepted',
      totalPrice: '999999.99',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const quote = await createQuote(ctx(), actor, maliciousInput)
    expect(quote.supplierCompanyId).toBe(supplierCompanyId)
    expect(quote.createdByUserId).toBe(actorUserId)
    expect(quote.status).toBe('draft')
    expect(quote.totalPrice).toBe('0.00')
  })

  it('removeQuotePosition recalculates the quote total', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-4', customerName: 'Test Customer' })

    const afterAdd = await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
    })
    expect(Number(afterAdd.quote.totalPrice)).toBeGreaterThan(0)

    const afterRemove = await removeQuotePosition(ctx(), actor, quote.id, afterAdd.positions[0].id)
    expect(afterRemove.positions).toHaveLength(0)
    expect(afterRemove.quote.totalPrice).toBe('0.00')
  })

  it("a different company cannot add a position to (or even see) another supplier's quote", async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-5', customerName: 'Test Customer' })

    const strangerCtx = { effectiveCompanyId: '00000000-0000-0000-0000-000000000000', isSuperAdmin: false }
    expect(await getQuote(strangerCtx, quote.id)).toBeNull()
    await expect(
      addQuotePosition(strangerCtx, actor, quote.id, {
        productFamilyId: family.id,
        productLineId: line.id,
        quantity: 1,
        widthMm: 1000,
        heightMm: 800,
        characteristicSelections: [],
      }),
    ).rejects.toThrow(QuoteValidationError)
  })

  it('renders a PDF that starts with the PDF magic bytes and is non-trivially sized', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-6', customerName: 'Test Customer' })
    await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
    })

    const detail = await getQuote(ctx(), quote.id)
    const pdf = await renderQuotePdf(detail!)
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(pdf.length).toBeGreaterThan(500)
  })

  it('reorders positions to match the given id order, and rejects a partial/foreign list', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-REORDER', customerName: 'Test Customer' })
    const addOne = () =>
      addQuotePosition(ctx(), actor, quote.id, {
        productFamilyId: family.id,
        productLineId: line.id,
        quantity: 1,
        widthMm: 1000,
        heightMm: 800,
        characteristicSelections: [],
      })
    await addOne()
    await addOne()
    const afterAdd = await addOne()
    const [p1, p2, p3] = afterAdd.positions

    const reordered = await reorderPositions(ctx(), actor, quote.id, [p3.id, p1.id, p2.id])
    expect(reordered.positions.map((p) => p.id)).toEqual([p3.id, p1.id, p2.id])
    expect(reordered.positions.map((p) => p.sortOrder)).toEqual([0, 1, 2])

    await expect(reorderPositions(ctx(), actor, quote.id, [p1.id, p2.id])).rejects.toThrow(QuoteValidationError)
    await expect(
      reorderPositions(ctx(), actor, quote.id, [p1.id, p2.id, '00000000-0000-0000-0000-000000000000']),
    ).rejects.toThrow(QuoteValidationError)
  })

  it('duplicatePosition copies a position (and its characteristic selections) as a new appended position', async () => {
    const family = await importFreshFamily()
    const familyDetail = await getProductFamilyDetail(ctx(), family.id)
    const line = await matrixLineOf(family.id)
    const main = familyDetail!.characteristics.find((c) => !c.parentId)!
    const sub = familyDetail!.characteristics.find((c) => c.parentId === main.id)!
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-DUP', customerName: 'Test Customer' })

    const afterAdd = await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [{ characteristicId: main.id, subCharacteristicId: sub.id }],
    })
    const original = afterAdd.positions[0]

    const afterDuplicate = await duplicatePosition(ctx(), actor, quote.id, original.id)
    expect(afterDuplicate.positions).toHaveLength(2)
    const copy = afterDuplicate.positions.find((p) => p.id !== original.id)!
    expect(copy.positionCode).toBe('P02')
    expect(copy.finalPrice).toBe(original.finalPrice)
    expect(copy.characteristics).toHaveLength(1)
    expect(copy.characteristics[0].subCharacteristicName).toBe(sub.name)
    expect(Number(afterDuplicate.quote.totalPrice)).toBeCloseTo(Number(original.finalPrice) * 2, 2)
  })

  it('flags a position invalid once its catalog family is unpublished, without changing its snapshotted price', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    await setProductFamilyPublishedStatus(ctx(), actor, family.id, true)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-VALIDITY', customerName: 'Test Customer' })

    const afterAdd = await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
    })
    expect(afterAdd.positions[0].isValid).toBe(true)
    const priceBefore = afterAdd.positions[0].finalPrice

    await setProductFamilyPublishedStatus(ctx(), actor, family.id, false)
    const afterUnpublish = await getQuote(ctx(), quote.id)
    expect(afterUnpublish!.positions[0].isValid).toBe(false)
    expect(afterUnpublish!.positions[0].finalPrice).toBe(priceBefore)
  })
})

describe('listMyQuotes', () => {
  it("is scoped by effectiveCompanyId even for a super-admin — never every tenant's quotes", async () => {
    await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-LIST-SUPPLIER', customerName: 'Test Customer' })

    const clientCtx = { effectiveCompanyId: linkedClientCompanyId, isSuperAdmin: false }
    const clientActor = { actorUserId, actorCompanyId: linkedClientCompanyId, requestId: 'test-request' }
    await createQuote(clientCtx, clientActor, { reference: 'TEST-Q-SVC-LIST-CLIENT', customerName: 'Test Customer' })

    // A super-admin acting AS the supplier (X-Tenant-Id) must see only the supplier's quotes.
    const superAdminAsSupplier = { effectiveCompanyId: supplierCompanyId, isSuperAdmin: true }
    const supplierQuotes = await listMyQuotes(superAdminAsSupplier)
    expect(supplierQuotes.every((q) => q.supplierCompanyId === supplierCompanyId)).toBe(true)
    expect(supplierQuotes.some((q) => q.supplierCompanyId === linkedClientCompanyId)).toBe(false)

    // Acting as the client instead must see only the client's quotes.
    const superAdminAsClient = { effectiveCompanyId: linkedClientCompanyId, isSuperAdmin: true }
    const clientQuotes = await listMyQuotes(superAdminAsClient)
    expect(clientQuotes.every((q) => q.supplierCompanyId === linkedClientCompanyId)).toBe(true)
  })
})
