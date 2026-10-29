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
  productFamilyShares,
  roles,
  users,
  withSystemTransaction,
  type Db,
} from '@schuco/db'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../src/lib/db'
import { renderQuotePdf } from '../src/lib/quote-pdf'
import {
  getProductFamilyDetail,
  importProductFamilyFromExcel,
  setProductFamilyPriceValidityDates,
  setProductFamilyPublishedStatus,
  setProductFamilyReadyForInvoicingStatus,
} from '../src/services/product-families-service'
import {
  QuoteValidationError,
  addQuotePosition,
  createQuote,
  duplicatePosition,
  getQuote,
  listMyQuotes,
  previewQuotePosition,
  removeQuotePosition,
  reorderPositions,
  updateQuotePosition,
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
const extraCompanyIds: string[] = []
let linkedClientCompanyId: string
const fixtureBuffer = readFileSync(join(__dirname, 'fixtures/product-family-sample.xlsx'))
const actor = { actorUserId: '', actorCompanyId: '', requestId: 'test-request' }

const ctx = () => ({ effectiveCompanyId: supplierCompanyId, isSuperAdmin: false })
const importFreshFamily = () =>
  importProductFamilyFromExcel(
    ctx(),
    actor,
    supplierCompanyId,
    { buffer: fixtureBuffer, originalName: 'product-family-sample.xlsx' },
    { readyForInvoicing: true },
  )
/** Shares a family `supplierCompanyId` → `linkedClientCompanyId` at the given default discount. */
const shareWithLinkedCompany = (familyId: string, discountPct = '0') =>
  withSystemTransaction(db, (tx) =>
    tx.insert(productFamilyShares).values({
      productFamilyId: familyId,
      fromCompanyId: supplierCompanyId,
      toCompanyId: linkedClientCompanyId,
      discountPct,
    }),
  )
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
      .values({ isManufacturer: true, isSupplier: true, name: 'Quote Service Test Supplier', vatNumber: 'QSVC-SUP' })
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
      .values({ isClient: true, isSupplier: true, name: 'Quote Service Test Linked Client', vatNumber: 'QSVC-CLIENT' })
      .returning({ id: companies.id })
    linkedClientCompanyId = linkedClient.id
  })
})

afterAll(async () => {
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
  await superuserDb
    .delete(auditLog)
    .where(inArray(auditLog.effectiveCompanyId, [supplierCompanyId, linkedClientCompanyId, ...extraCompanyIds]))

  await withSystemTransaction(db, async (tx) => {
    // Quotes must go first: quote_positions.product_family_id is RESTRICT, and a
    // single company delete fires the quotes-cascade and product_families-cascade
    // in an order Postgres doesn't guarantee, so deleting quotes explicitly here
    // avoids a transient FK violation during company cleanup.
    await tx.delete(quotes).where(inArray(quotes.supplierCompanyId, [supplierCompanyId, linkedClientCompanyId, ...extraCompanyIds]))
    await tx.delete(users).where(inArray(users.id, [actorUserId]))
    await tx.delete(companies).where(inArray(companies.id, [supplierCompanyId, linkedClientCompanyId, ...extraCompanyIds]))
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

  it("lets a company quote from a PUBLISHED family shared with it, under its own quote", async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    await setProductFamilyPublishedStatus(ctx(), actor, family.id, true)
    await shareWithLinkedCompany(family.id)

    const linkedCtx = { effectiveCompanyId: linkedClientCompanyId, isSuperAdmin: false }
    const linkedActor = { actorUserId, actorCompanyId: linkedClientCompanyId, requestId: 'test-request' }
    expect(await getProductFamilyDetail(linkedCtx, family.id)).not.toBeNull()

    const linkedQuote = await createQuote(linkedCtx, linkedActor, {
      reference: 'TEST-Q-SVC-LINKED-CATALOG',
      customerName: 'Test Customer',
    })
    const detail = await addQuotePosition(linkedCtx, linkedActor, linkedQuote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
    })
    expect(linkedQuote.supplierCompanyId).toBe(linkedClientCompanyId)
    expect(detail.positions).toHaveLength(1)
  })

  it("rejects quoting from a family that was not shared with the caller", async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    await setProductFamilyPublishedStatus(ctx(), actor, family.id, true)

    const [stranger] = await withSystemTransaction(db, (tx) =>
      tx
        .insert(companies)
        .values({ isSupplier: true, name: 'Quote Service Test Unlinked Supplier', vatNumber: 'QSVC-UNLINKED' })
        .returning({ id: companies.id }),
    )
    try {
      const strangerCtx = { effectiveCompanyId: stranger.id, isSuperAdmin: false }
      const strangerActor = { actorUserId, actorCompanyId: stranger.id, requestId: 'test-request' }
      const strangerQuote = await createQuote(strangerCtx, strangerActor, {
        reference: 'TEST-Q-SVC-UNLINKED',
        customerName: 'Test Customer',
      })
      await expect(
        addQuotePosition(strangerCtx, strangerActor, strangerQuote.id, {
          productFamilyId: family.id,
          productLineId: line.id,
          quantity: 1,
          widthMm: 1000,
          heightMm: 800,
          characteristicSelections: [],
        }),
      ).rejects.toThrow(QuoteValidationError)
    } finally {
      extraCompanyIds.push(stranger.id) // audit_log is append-only for the app role — afterAll cleans up with the superuser
    }
  })

  it("starts a shared family's positions at the share's discount, and falls back to the line's own discount when shared at 0%", async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    await setProductFamilyPublishedStatus(ctx(), actor, family.id, true)
    await shareWithLinkedCompany(family.id, '25.00')

    const linkedCtx = { effectiveCompanyId: linkedClientCompanyId, isSuperAdmin: false }
    const linkedActor = { actorUserId, actorCompanyId: linkedClientCompanyId, requestId: 'test-request' }
    const quote = await createQuote(linkedCtx, linkedActor, { reference: 'TEST-Q-SVC-SHARE-DISCOUNT', customerName: 'Test Customer' })
    const position = { productFamilyId: family.id, productLineId: line.id, quantity: 1, widthMm: 1000, heightMm: 800, characteristicSelections: [] }

    const defaulted = await addQuotePosition(linkedCtx, linkedActor, quote.id, position)
    expect(Number(defaulted.positions[0].discountPct)).toBe(25)

    const overridden = await addQuotePosition(linkedCtx, linkedActor, quote.id, { ...position, discountPct: 10 })
    expect(Number(overridden.positions[1].discountPct)).toBe(10) // the share's discount is only a default

    await withSystemTransaction(db, (tx) =>
      tx.update(productFamilyShares).set({ discountPct: '0' }).where(eq(productFamilyShares.productFamilyId, family.id)),
    )
    const fallback = await addQuotePosition(linkedCtx, linkedActor, quote.id, position)
    expect(Number(fallback.positions[2].discountPct)).toBe(Number(line.discountPct))

    // The owner's own quotes never pick up a share discount.
    const ownQuote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-OWN-DISCOUNT', customerName: 'Test Customer' })
    const own = await addQuotePosition(ctx(), actor, ownQuote.id, position)
    expect(Number(own.positions[0].discountPct)).toBe(Number(line.discountPct))
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

  it("addQuotePosition honors a custom positionCode instead of auto-numbering, and rejects a duplicate one (the reference app's \"Add POS\" naming dialog)", async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-POSCODE-1', customerName: 'Test Customer' })

    const afterAdd = await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
      positionCode: 'Frame A',
    })
    expect(afterAdd.positions[0].positionCode).toBe('Frame A')

    // Second position with no code -> still auto-numbers from P01 (ignores the custom name already used).
    const afterSecond = await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
    })
    expect(afterSecond.positions[1].positionCode).toBe('P01')

    await expect(
      addQuotePosition(ctx(), actor, quote.id, {
        productFamilyId: family.id,
        productLineId: line.id,
        quantity: 1,
        widthMm: 1000,
        heightMm: 800,
        characteristicSelections: [],
        positionCode: 'Frame A', // already used above
      }),
    ).rejects.toThrow(QuoteValidationError)
  })

  it('updateQuotePosition leaves positionCode unchanged when none is given, but renames it (with the same uniqueness check) when one is', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-POSCODE-2', customerName: 'Test Customer' })
    const afterAdd = await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
    })
    const original = afterAdd.positions[0]
    expect(original.positionCode).toBe('P01')

    const unchangedEdit = await updateQuotePosition(ctx(), actor, quote.id, original.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 2,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
      // positionCode omitted — must NOT be renumbered as a side effect of editing.
    })
    expect(unchangedEdit.positions[0].positionCode).toBe('P01')

    const renamedEdit = await updateQuotePosition(ctx(), actor, quote.id, original.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 2,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
      positionCode: 'Main Door',
    })
    expect(renamedEdit.positions[0].positionCode).toBe('Main Door')
  })

  it('updateQuotePosition re-prices an existing position in place, keeping its positionCode/sortOrder, and recalculates the quote total', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-UPD-1', customerName: 'Test Customer' })

    const afterAdd = await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
    })
    const original = afterAdd.positions[0]
    expect(original.basePrice).toBe('555.00') // matrix lookup at 1000x800

    const afterUpdate = await updateQuotePosition(ctx(), actor, quote.id, original.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 2, // was 1
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
    })

    expect(afterUpdate.positions).toHaveLength(1)
    const updated = afterUpdate.positions[0]
    expect(updated.id).toBe(original.id)
    expect(updated.positionCode).toBe(original.positionCode)
    expect(updated.sortOrder).toBe(original.sortOrder)
    expect(updated.quantity).toBe(2)
    expect(updated.basePrice).toBe('1110.00') // 555 * 2
    expect(afterUpdate.quote.totalPrice).toBe(updated.finalPrice)
  })

  it('updateQuotePosition replaces characteristic selections rather than merging — a deselected one leaves no stale row', async () => {
    const family = await importFreshFamily()
    const familyDetail = await getProductFamilyDetail(ctx(), family.id)
    const line = await matrixLineOf(family.id)
    const main = familyDetail!.characteristics.find((c) => !c.parentId)!
    const sub = familyDetail!.characteristics.find((c) => c.parentId === main.id)!
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-UPD-2', customerName: 'Test Customer' })

    const afterAdd = await addQuotePosition(ctx(), actor, quote.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [{ characteristicId: main.id, subCharacteristicId: sub.id }],
    })
    expect(afterAdd.positions[0].characteristics).toHaveLength(1)

    const afterUpdate = await updateQuotePosition(ctx(), actor, quote.id, afterAdd.positions[0].id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [], // deselected
    })

    expect(afterUpdate.positions[0].characteristics).toHaveLength(0)
  })

  it('updateQuotePosition rejects a positionId from a different quote, instead of silently updating the wrong one', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quoteA = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-UPD-3A', customerName: 'Test Customer' })
    const quoteB = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-UPD-3B', customerName: 'Test Customer' })
    const afterAdd = await addQuotePosition(ctx(), actor, quoteA.id, {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 800,
      characteristicSelections: [],
    })

    await expect(
      updateQuotePosition(ctx(), actor, quoteB.id, afterAdd.positions[0].id, {
        productFamilyId: family.id,
        productLineId: line.id,
        quantity: 5,
        widthMm: 1000,
        heightMm: 800,
        characteristicSelections: [],
      }),
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

describe('capability gate', () => {
  it('rejects creating a quote from a company that is not a supplier', async () => {
    const [clientOnly] = await withSystemTransaction(db, (tx) =>
      tx
        .insert(companies)
        .values({ isClient: true, name: 'Quote Service Test Client Only', vatNumber: 'QSVC-CLIENT-ONLY' })
        .returning({ id: companies.id }),
    )
    try {
      const clientCtx = { effectiveCompanyId: clientOnly.id, isSuperAdmin: false }
      const clientActor = { actorUserId, actorCompanyId: clientOnly.id, requestId: 'test-request' }
      await expect(
        createQuote(clientCtx, clientActor, { reference: 'TEST-Q-SVC-CLIENT-ONLY', customerName: 'Test Customer' }),
      ).rejects.toThrow()
    } finally {
      await withSystemTransaction(db, (tx) => tx.delete(companies).where(eq(companies.id, clientOnly.id)))
    }
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

describe('price validity', () => {
  const positionOn = (familyId: string, lineId: string) => ({
    productFamilyId: familyId,
    productLineId: lineId,
    quantity: 1,
    widthMm: 1000,
    heightMm: 800,
    characteristicSelections: [],
  })

  it('refuses new positions from a family whose prices have expired or not started yet', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-VALID-1', customerName: 'Test Customer' })

    await setProductFamilyPriceValidityDates(ctx(), actor, family.id, { priceValidFrom: '2020-01-01', priceValidTo: '2020-12-31' })
    await expect(addQuotePosition(ctx(), actor, quote.id, positionOn(family.id, line.id))).rejects.toThrow(/expired on 2020-12-31/)
    await expect(previewQuotePosition(ctx(), positionOn(family.id, line.id))).rejects.toThrow(QuoteValidationError)

    await setProductFamilyPriceValidityDates(ctx(), actor, family.id, { priceValidFrom: '2999-01-01', priceValidTo: null })
    await expect(addQuotePosition(ctx(), actor, quote.id, positionOn(family.id, line.id))).rejects.toThrow(/valid from 2999-01-01/)

    await setProductFamilyPriceValidityDates(ctx(), actor, family.id, { priceValidFrom: '2020-01-01', priceValidTo: null })
    const detail = await addQuotePosition(ctx(), actor, quote.id, positionOn(family.id, line.id))
    expect(detail.positions).toHaveLength(1)
  })

  it('refuses new positions from a family that is not ready for invoicing, but keeps existing ones editable', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-INVOICING', customerName: 'Test Customer' })
    const added = await addQuotePosition(ctx(), actor, quote.id, positionOn(family.id, line.id))

    await setProductFamilyReadyForInvoicingStatus(ctx(), actor, family.id, false)
    await expect(addQuotePosition(ctx(), actor, quote.id, positionOn(family.id, line.id))).rejects.toThrow(/not ready for invoicing/)
    await expect(duplicatePosition(ctx(), actor, quote.id, added.positions[0].id)).rejects.toThrow(/not ready for invoicing/)
    const updated = await updateQuotePosition(ctx(), actor, quote.id, added.positions[0].id, { ...positionOn(family.id, line.id), quantity: 2 })
    expect(updated.positions[0].quantity).toBe(2)

    await setProductFamilyReadyForInvoicingStatus(ctx(), actor, family.id, true)
    const detail = await addQuotePosition(ctx(), actor, quote.id, positionOn(family.id, line.id))
    expect(detail.positions).toHaveLength(2)
  })

  it('still lets an existing position be edited after its family expires', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-VALID-2', customerName: 'Test Customer' })
    const added = await addQuotePosition(ctx(), actor, quote.id, positionOn(family.id, line.id))
    const position = added.positions[0]

    await setProductFamilyPriceValidityDates(ctx(), actor, family.id, { priceValidFrom: '2020-01-01', priceValidTo: '2020-12-31' })

    const updated = await updateQuotePosition(ctx(), actor, quote.id, position.id, { ...positionOn(family.id, line.id), quantity: 2 })
    expect(updated.positions[0].quantity).toBe(2)
    const preview = await previewQuotePosition(ctx(), positionOn(family.id, line.id), { quoteId: quote.id, positionId: position.id })
    expect(preview.basePrice).toBe(555)
  })

  it('refuses to duplicate a position whose family has expired — the copy would be a new position', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await createQuote(ctx(), actor, { reference: 'TEST-Q-SVC-VALID-3', customerName: 'Test Customer' })
    const added = await addQuotePosition(ctx(), actor, quote.id, positionOn(family.id, line.id))

    await setProductFamilyPriceValidityDates(ctx(), actor, family.id, { priceValidFrom: '2020-01-01', priceValidTo: '2020-12-31' })

    await expect(duplicatePosition(ctx(), actor, quote.id, added.positions[0].id)).rejects.toThrow(/expired on 2020-12-31/)
  })
})
