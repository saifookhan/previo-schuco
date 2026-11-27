process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  auditLog,
  companies,
  createDb,
  productFamilyShareItems,
  productFamilyShares,
  productLines,
  quotes,
  roles,
  users,
  withSystemTransaction,
  type Db,
} from '@schuco/db'
import type { QuoteDocument, QuoteFamily, QuoteLine, SalesQuoteDetailResponse } from '@schuco/contracts'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../src/lib/db'
import {
  createNewVersionFromExcel,
  getProductFamilyDetail,
  importProductFamilyFromExcel,
  listProductFamilies,
  setProductFamilyArchived,
  setProductFamilyFavorite,
  setProductFamilyLibraryStatus,
  setProductFamilyPriceValidityDates,
  setProductFamilyPublishedStatus,
  setProductFamilyReadyForInvoicingStatus,
} from '../src/services/product-families-service'
import {
  QuoteConflictError,
  QuoteForbiddenError,
  QuoteValidationError,
  createQuote,
  createQuoteAlternative,
  duplicateQuoteVariant,
  getQuote,
  getQuotePrintData,
  getQuoteRevisionDetail,
  getQuoteRevisions,
  listMyQuotes,
  priceQuoteLines,
  promoteQuoteVariant,
  saveQuoteVersion,
  setQuoteArchived,
  setQuoteVariantFavorite,
  setQuoteVariantFinal,
  setQuoteVariantLabelById,
  setQuoteVersionStatusById,
} from '../src/services/quotes-service'

/**
 * Service-layer test (ADR 0012): builds real quotes from the real supplier workbook. The
 * fixture's matrix line at width=1000/height=800 costs 555, at the line's own 43% discount and
 * 150% markup — so its catalog €/pz is 555 × 0.57 × 1.5 = 474.525 (verified by hand in the
 * pricing tests).
 */

const CATALOG_UNIT_PRICE = 474.525

let db: Db
let supplierCompanyId: string
let actorUserId: string
const extraCompanyIds: string[] = []
let linkedClientCompanyId: string
const fixtureBuffer = readFileSync(join(__dirname, 'fixtures/product-family-sample.xlsx'))
const fixtureFile = { buffer: fixtureBuffer, originalName: 'product-family-sample.xlsx' }
const actor = { actorUserId: '', actorCompanyId: '', requestId: 'test-request' }

const ctx = () => ({ effectiveCompanyId: supplierCompanyId, isSuperAdmin: false })
const importFreshFamily = () => importProductFamilyFromExcel(ctx(), actor, supplierCompanyId, fixtureFile, { readyForInvoicing: true })
/** Shares a family `supplierCompanyId` → `linkedClientCompanyId`, with the given values for some lines and options. */
const shareWithLinkedCompany = (familyId: string, items: Omit<typeof productFamilyShareItems.$inferInsert, 'shareId'>[] = []) =>
  withSystemTransaction(db, async (tx) => {
    const [share] = await tx
      .insert(productFamilyShares)
      .values({ productFamilyId: familyId, fromCompanyId: supplierCompanyId, toCompanyId: linkedClientCompanyId })
      .returning({ id: productFamilyShares.id })
    if (items.length) {
      await tx.insert(productFamilyShareItems).values(items.map((item) => ({ ...item, shareId: share.id })))
    }
  })
const matrixLineOf = async (familyId: string, context = ctx()) => {
  const detail = await getProductFamilyDetail(context, familyId)
  return detail!.lines.find((l) => l.name.startsWith('N95 L'))!
}

const newQuote = (reference: string, context = ctx(), quoteActor = actor) =>
  createQuote(context, quoteActor, {
    reference,
    header: { customerName: 'Test Customer', customerFiscalCode: null, customerAddress: null, customerCity: null, projectLocation: null },
  })

const catalogLine = (productLineId: string, overrides: Partial<QuoteLine> = {}): QuoteLine => ({
  id: `l-${Math.random().toString(36).slice(2)}`,
  code: 'P01',
  productLineId,
  name: 'N95',
  quantity: 1,
  unit: 'pz',
  widthMm: 1000,
  heightMm: 800,
  options: [],
  priceMode: 'catalog',
  unitPrice: 0,
  extraMarkupPct: 0,
  discountPct: 0,
  vatRate: '22%',
  installationHours: null,
  locked: false,
  isAlternative: false,
  ...overrides,
})

const familyOf = (productFamilyId: string | null, lines: QuoteLine[], overrides: Partial<QuoteFamily> = {}): QuoteFamily => ({
  id: `f-${Math.random().toString(36).slice(2)}`,
  productFamilyId,
  name: 'Finestre',
  category: 'Serramenti',
  isAlternative: false,
  description: '',
  notes: '',
  lines,
  ...overrides,
})

/** Saves `families` (and any other changes) into the quote's current version. */
const save = (
  detail: SalesQuoteDetailResponse,
  change: Partial<QuoteDocument>,
  mode: 'update' | 'newVersion' = 'update',
  context = ctx(),
  quoteActor = actor,
) =>
  saveQuoteVersion(context, quoteActor, detail.quote.id, detail.version.id, {
    document: { ...detail.version.document, ...change },
    mode,
    baseRevision: detail.version.revision,
  })

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
        name: 'Quote Tester',
        companyId: supplierCompanyId,
        roleId: 'company-admin',
        status: 'active',
      })
      .returning({ id: users.id })
    actorUserId = user.id
    actor.actorUserId = actorUserId

    // A company linked as this supplier's client — RLS lets it SELECT the supplier's
    // *published* families, which is exactly the gap the share check guards against.
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
    await tx.delete(quotes).where(inArray(quotes.supplierCompanyId, [supplierCompanyId, linkedClientCompanyId, ...extraCompanyIds]))
    await tx.delete(users).where(inArray(users.id, [actorUserId]))
    await tx.delete(companies).where(inArray(companies.id, [supplierCompanyId, linkedClientCompanyId, ...extraCompanyIds]))
  })
})

describe('createQuote', () => {
  it('starts a draft with an empty first version, the default closing and the caller as sales contact', async () => {
    const detail = await newQuote('TEST-Q-SVC-NEW')
    expect(detail.quote).toMatchObject({ reference: 'TEST-Q-SVC-NEW', status: 'draft', totalPrice: '0.00', latestVersion: 1 })
    expect(detail.versions.map((v) => v.version)).toEqual([1])
    expect(detail.version).toMatchObject({ version: 1, status: 'draft', revision: 1, createdBy: { id: actorUserId, name: 'Quote Tester' } })
    expect(detail.version.document.families).toEqual([])
    expect(detail.version.document.closing.map((block) => block.type)).toEqual([
      'text',
      'familySummary',
      'categorySummary',
      'total',
      'payments',
      'activities',
      'text',
    ])
    const closing = detail.version.document.closing
    expect(detail.version.document.intro[0].html).toContain('Gentile Cliente')
    expect(closing.filter((block) => block.type === 'text').every((block) => block.type === 'text' && block.html !== '')).toBe(true)
    const payments = closing.find((block) => block.type === 'payments')
    const activities = closing.find((block) => block.type === 'activities')
    expect(payments?.type === 'payments' && payments.rows.reduce((sum, row) => sum + row.pct, 0)).toBe(100)
    expect(activities?.type === 'activities' && activities.rows.filter((row) => !row.included).map((row) => row.description)).toEqual([
      'Progettazione esecutiva',
      'Assistenza post-vendita',
      'Documentazione tecnica',
    ])
    expect(detail.version.document.printSettings.salesContactUserId).toBe(actorUserId)
    expect(await getQuoteRevisions(ctx(), detail.quote.id, detail.version.id)).toEqual([
      expect.objectContaining({ revision: 1, changes: [], fromVersion: null }),
    ])
  })

  it('is refused for a company that is not a supplier (RLS)', async () => {
    const [clientOnly] = await withSystemTransaction(db, (tx) =>
      tx.insert(companies).values({ isClient: true, name: 'Quote Service Test Client Only', vatNumber: 'QSVC-CLIENT-ONLY' }).returning({ id: companies.id }),
    )
    try {
      const clientCtx = { effectiveCompanyId: clientOnly.id, isSuperAdmin: false }
      await expect(newQuote('TEST-Q-SVC-CLIENT-ONLY', clientCtx, { ...actor, actorCompanyId: clientOnly.id })).rejects.toThrow()
    } finally {
      await withSystemTransaction(db, (tx) => tx.delete(companies).where(eq(companies.id, clientOnly.id)))
    }
  })
})

describe('pricing lines', () => {
  it('prices a catalog line with the same costing engine as the catalog, one error per line it cannot price', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const priced = await priceQuoteLines(ctx(), {
      lines: [
        { key: 'ok', productFamilyId: family.id, productLineId: line.id, widthMm: 1000, heightMm: 800, options: [] },
        { key: 'no-size', productFamilyId: family.id, productLineId: line.id, widthMm: null, heightMm: 800, options: [] },
        { key: 'too-big', productFamilyId: family.id, productLineId: line.id, widthMm: 99_000, heightMm: 99_000, options: [] },
      ],
    })
    expect(priced[0]).toMatchObject({ key: 'ok', ok: true, minApplied: false })
    expect(priced[0].ok && priced[0].unitPrice).toBeCloseTo(CATALOG_UNIT_PRICE, 4)
    expect(priced[1]).toMatchObject({ key: 'no-size', ok: false, error: expect.stringMatching(/width and a height/) })
    expect(priced[2]).toMatchObject({ key: 'too-big', ok: false })
  })

  it('prices a line whose Excel left discount, markup and hours empty with none of them', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    await withSystemTransaction(db, (tx) =>
      tx.update(productLines).set({ discountPct: null, markupPct: null, installationHoursPerUnit: null }).where(eq(productLines.id, line.id)),
    )
    const [priced] = await priceQuoteLines(ctx(), {
      lines: [{ key: 'a', productFamilyId: family.id, productLineId: line.id, widthMm: 1000, heightMm: 800, options: [] }],
    })
    expect(priced).toMatchObject({ ok: true, unitPrice: 555, installationHours: 0 })
  })

  it("adds an option's price on top of the line's", async () => {
    const family = await importFreshFamily()
    const detail = (await getProductFamilyDetail(ctx(), family.id))!
    const line = await matrixLineOf(family.id)
    const main = detail.characteristics.find((c) => !c.parentId)!
    const sub = detail.characteristics.find((c) => c.parentId === main.id && (c.formula || c.pricingMatrixId))!
    const [priced] = await priceQuoteLines(ctx(), {
      lines: [
        {
          key: 'a',
          productFamilyId: family.id,
          productLineId: line.id,
          widthMm: 1000,
          heightMm: 800,
          options: [{ characteristicId: main.id, subCharacteristicId: sub.id }],
        },
      ],
    })
    expect(priced.ok && priced.unitPrice).toBeGreaterThan(CATALOG_UNIT_PRICE)
  })
})

describe('saving a version', () => {
  it('reprices catalog lines on the server, keeps manual ones as typed, and totals without alternatives', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await newQuote('TEST-Q-SVC-SAVE')

    const saved = await save(quote, {
      families: [
        familyOf(family.id, [
          // A client can't choose the catalog price: 1 is replaced by the catalog's.
          catalogLine(line.id, { quantity: 2, unitPrice: 1, extraMarkupPct: 10, discountPct: 20 }),
          catalogLine(line.id, { code: 'P02', priceMode: 'manual', unitPrice: 100 }),
          catalogLine(line.id, { code: 'P03', isAlternative: true }),
        ]),
        familyOf(null, [catalogLine(line.id, { productLineId: null, priceMode: 'manual', unitPrice: 50, quantity: 3 })], {
          name: 'Posa',
        }),
        familyOf(null, [catalogLine(line.id, { productLineId: null, priceMode: 'manual', unitPrice: 1000 })], { isAlternative: true }),
      ],
    })
    const [catalog, manual, alternative] = saved.version.document.families[0].lines
    expect(catalog.unitPrice).toBeCloseTo(CATALOG_UNIT_PRICE, 4)
    expect(manual.unitPrice).toBe(100)
    expect(alternative.unitPrice).toBeCloseTo(CATALOG_UNIT_PRICE, 4)
    // 2 × 474.525 × 1.10 × 0.80 + 100 + 3 × 50; the alternative line and family are left out.
    const expected = (2 * CATALOG_UNIT_PRICE * 1.1 * 0.8 + 100 + 150).toFixed(2)
    expect(saved.version.totalPrice).toBe(expected)
    expect(saved.quote.totalPrice).toBe(expected)
    expect(saved.version.revision).toBe(2)
  })

  it('refuses a line of a hand-typed family that claims a catalog price', async () => {
    const quote = await newQuote('TEST-Q-SVC-FREE')
    await expect(
      save(quote, { families: [familyOf(null, [catalogLine('00000000-0000-0000-0000-000000000000', { productLineId: null })])] }),
    ).rejects.toThrow(/need their own price/)
  })

  it('strips scripts and event handlers from rich text', async () => {
    const quote = await newQuote('TEST-Q-SVC-HTML')
    const saved = await save(quote, {
      intro: [{ id: 'm-1', html: '<p style="text-align: center" onclick="x()">Ciao<script>alert(1)</script> <a href="javascript:x()">link</a></p>' }],
      closing: [{ id: 'c-1', type: 'text', html: '<img src="data:text/html;base64,AAAA"><strong>Fine</strong>' }],
    })
    expect(saved.version.document.intro[0].html).toBe('<p style="text-align:center">Ciao <a rel="noopener noreferrer" target="_blank">link</a></p>')
    expect(saved.version.document.closing[0]).toEqual({ id: 'c-1', type: 'text', html: '<strong>Fine</strong>' })
  })

  it('keeps every save with what changed, and refuses a save over a newer one', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await newQuote('TEST-Q-SVC-HISTORY')
    const first = await save(quote, { families: [familyOf(family.id, [catalogLine(line.id)])] })
    const lineId = first.version.document.families[0].lines[0].id
    const second = await save(first, {
      header: { ...first.version.document.header, customerName: 'Altro Cliente' },
      families: [{ ...first.version.document.families[0], lines: [{ ...first.version.document.families[0].lines[0], quantity: 4 }] }],
    })
    expect(second.version.revision).toBe(3)
    expect(second.quote.customerName).toBe('Altro Cliente')

    // Saving from what was loaded before the second save would overwrite it.
    await expect(save(first, {})).rejects.toThrow(QuoteConflictError)

    const revisions = (await getQuoteRevisions(ctx(), quote.quote.id, quote.version.id))!
    expect(revisions.map((r) => r.revision)).toEqual([3, 2, 1])
    expect(revisions[0].savedBy).toEqual({ id: actorUserId, name: 'Quote Tester' })
    expect(revisions[0].changes).toEqual(
      expect.arrayContaining([
        { kind: 'header', field: 'customerName', from: 'Test Customer', to: 'Altro Cliente' },
        { kind: 'line_changed', family: 'Finestre', line: 'P01 N95', field: 'quantity', from: 1, to: 4 },
      ]),
    )
    expect(revisions[1].changes).toEqual([{ kind: 'family_added', family: 'Finestre' }])

    const past = await getQuoteRevisionDetail(ctx(), quote.quote.id, quote.version.id, 2)
    expect(past!.document.families[0].lines).toEqual([expect.objectContaining({ id: lineId, quantity: 1 })])
    expect(await getQuoteRevisionDetail(ctx(), quote.quote.id, quote.version.id, 99)).toBeNull()
  })

  it('an invoiced version is never changed in place: its edits become the next version, a draft', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await newQuote('TEST-Q-SVC-VERSIONS')
    const draft = await save(quote, { families: [familyOf(family.id, [catalogLine(line.id)])] })
    const invoiced = await setQuoteVersionStatusById(ctx(), actor, quote.quote.id, draft.version.id, 'invoiced')
    expect(invoiced.version).toMatchObject({ status: 'invoiced', sentAt: expect.any(String) })
    expect(invoiced.quote.status).toBe('invoiced')

    const edited = { families: [{ ...invoiced.version.document.families[0], name: 'Finestre bis' }] }
    await expect(save(invoiced, edited)).rejects.toThrow(/save your changes as a new version/)
    const v2 = await save(invoiced, edited, 'newVersion')
    expect(v2.version).toMatchObject({ version: 2, alternative: 1, status: 'draft', revision: 1 })
    expect(v2.quote).toMatchObject({ latestVersion: 2, status: 'draft' })
    expect(v2.versions.map((v) => [v.version, v.alternative, v.status])).toEqual([
      [1, 1, 'invoiced'],
      [2, 1, 'draft'],
    ])
    expect((await getQuoteRevisions(ctx(), quote.quote.id, v2.version.id))![0]).toMatchObject({
      fromVersion: 1,
      changes: [{ kind: 'family_changed', family: 'Finestre bis', field: 'name', from: 'Finestre', to: 'Finestre bis' }],
    })

    const v1 = await getQuote(ctx(), quote.quote.id, 1)
    expect(v1!.version.document.families[0].name).toBe('Finestre')
    await expect(setQuoteVersionStatusById(ctx(), actor, quote.quote.id, draft.version.id, 'invoiced')).rejects.toThrow(/already invoiced/)
    expect((await setQuoteVersionStatusById(ctx(), actor, quote.quote.id, draft.version.id, 'accepted')).version.status).toBe('accepted')
    // v1 isn't the latest, so the list keeps showing v2's status.
    expect((await getQuote(ctx(), quote.quote.id))!.quote.status).toBe('draft')
  })

  it("can't be seen or saved by another company", async () => {
    const quote = await newQuote('TEST-Q-SVC-ISOLATION')
    const strangerCtx = { effectiveCompanyId: '00000000-0000-0000-0000-000000000000', isSuperAdmin: false }
    expect(await getQuote(strangerCtx, quote.quote.id)).toBeNull()
    expect(await getQuotePrintData(strangerCtx, quote.quote.id)).toBeNull()
    expect(await getQuoteRevisions(strangerCtx, quote.quote.id, quote.version.id)).toBeNull()
    await expect(save(quote, {}, 'update', strangerCtx)).rejects.toThrow(QuoteValidationError)
  })
})

describe('families from other companies', () => {
  it('a company prices a PUBLISHED family shared with it at the share\'s values, and the owner at its own', async () => {
    const family = await importFreshFamily()
    const detail = (await getProductFamilyDetail(ctx(), family.id))!
    const line = await matrixLineOf(family.id)
    const main = detail.characteristics.find((c) => !c.parentId)!
    const sub = detail.characteristics.find((c) => c.parentId === main.id && !c.formula && !c.pricingMatrixId) ?? null
    await setProductFamilyPublishedStatus(ctx(), actor, family.id, true)
    await shareWithLinkedCompany(family.id, [{ productLineId: line.id, discountPct: '25', markupPct: '140', installationHoursPerUnit: '2' }])

    const linkedCtx = { effectiveCompanyId: linkedClientCompanyId, isSuperAdmin: false }
    const linkedActor = { actorUserId, actorCompanyId: linkedClientCompanyId, requestId: 'test-request' }
    const input = {
      key: 'a',
      productFamilyId: family.id,
      productLineId: line.id,
      widthMm: 1000,
      heightMm: 800,
      options: sub ? [{ characteristicId: main.id, subCharacteristicId: sub.id }] : [],
    }
    // The line (555) at -25% ×1.4; a free option adds nothing.
    const [shared] = await priceQuoteLines(linkedCtx, { lines: [input] })
    expect(shared).toMatchObject({ ok: true, installationHours: 2 })
    expect(shared.ok && shared.unitPrice).toBeCloseTo(582.75, 4)
    const [own] = await priceQuoteLines(ctx(), { lines: [input] })
    expect(own.ok && own.unitPrice).toBeCloseTo(CATALOG_UNIT_PRICE, 4)

    // A save stores the same price, under the company's own quote.
    const quote = await newQuote('TEST-Q-SVC-SHARED', linkedCtx, linkedActor)
    const saved = await save(quote, { families: [familyOf(family.id, [catalogLine(line.id)])] }, 'update', linkedCtx, linkedActor)
    expect(saved.version.document.families[0].lines[0].unitPrice).toBeCloseTo(582.75, 4)
  })

  it('refuses a family that was not shared with the caller, also for a super-admin acting as another tenant', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    await setProductFamilyPublishedStatus(ctx(), actor, family.id, true)
    const [stranger] = await withSystemTransaction(db, (tx) =>
      tx.insert(companies).values({ isSupplier: true, name: 'Quote Service Test Unlinked Supplier', vatNumber: 'QSVC-UNLINKED' }).returning({ id: companies.id }),
    )
    extraCompanyIds.push(stranger.id) // audit_log is append-only for the app role — afterAll cleans up with the superuser
    for (const strangerCtx of [
      { effectiveCompanyId: stranger.id, isSuperAdmin: false },
      { effectiveCompanyId: stranger.id, isSuperAdmin: true },
    ]) {
      const strangerActor = { actorUserId, actorCompanyId: stranger.id, requestId: 'test-request' }
      const quote = await newQuote('TEST-Q-SVC-UNLINKED', strangerCtx, strangerActor)
      await expect(
        save(quote, { families: [familyOf(family.id, [catalogLine(line.id)])] }, 'update', strangerCtx, strangerActor),
      ).rejects.toThrow(/not found or not visible/)
      const [priced] = await priceQuoteLines(strangerCtx, {
        lines: [{ key: 'a', productFamilyId: family.id, productLineId: line.id, widthMm: 1000, heightMm: 800, options: [] }],
      })
      expect(priced.ok).toBe(false)
    }
  })
})

describe('price validity', () => {
  it('a family new to the version must be in the library and ready for invoicing; one already on it may stay', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await newQuote('TEST-Q-SVC-LIBRARY')

    await setProductFamilyReadyForInvoicingStatus(ctx(), actor, family.id, false)
    await expect(save(quote, { families: [familyOf(family.id, [catalogLine(line.id)])] })).rejects.toThrow(/not ready for invoicing/)
    await setProductFamilyReadyForInvoicingStatus(ctx(), actor, family.id, true)
    const saved = await save(quote, { families: [familyOf(family.id, [catalogLine(line.id)])] })

    await setProductFamilyLibraryStatus(ctx(), actor, family.id, false)
    await setProductFamilyReadyForInvoicingStatus(ctx(), actor, family.id, false)
    const kept = await save(saved, {
      families: [{ ...saved.version.document.families[0], lines: [...saved.version.document.families[0].lines, catalogLine(line.id, { code: 'P02' })] }],
    })
    expect(kept.version.document.families[0].lines).toHaveLength(2)
    await expect(save(kept, { families: [...kept.version.document.families, familyOf(family.id, [catalogLine(line.id)])] })).resolves.toBeTruthy()
  })

  it('an expired family blocks saving and sending, and points to the newer version to switch to', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await newQuote('TEST-Q-SVC-EXPIRED')
    const saved = await save(quote, { families: [familyOf(family.id, [catalogLine(line.id)])] })

    await setProductFamilyPriceValidityDates(ctx(), actor, family.id, { priceValidFrom: '2020-01-01', priceValidTo: '2020-12-31' })
    const expired = (await getQuote(ctx(), quote.quote.id))!
    expect(expired.familyStatus).toEqual([
      expect.objectContaining({ productFamilyId: family.id, status: 'expired', priceValidTo: '2020-12-31', replacement: null }),
    ])
    await expect(save(expired, {})).rejects.toThrow(/expired on 2020-12-31: switch to a newer version/)
    await expect(setQuoteVersionStatusById(ctx(), actor, quote.quote.id, saved.version.id, 'invoiced')).rejects.toThrow(/expired on 2020-12-31/)
    const [priced] = await priceQuoteLines(ctx(), {
      lines: [{ key: 'a', productFamilyId: family.id, productLineId: line.id, widthMm: 1000, heightMm: 800, options: [] }],
    })
    expect(priced).toMatchObject({ ok: false, error: expect.stringMatching(/expired/) })

    const newer = await createNewVersionFromExcel(ctx(), actor, family.id, fixtureFile, { readyForInvoicing: true })
    const withReplacement = (await getQuote(ctx(), quote.quote.id))!
    expect(withReplacement.familyStatus[0].replacement).toEqual({ id: newer.id, version: newer.version, name: newer.name })

    // Switching the family (and its lines) to the newer version reprices them from it and saves.
    const newerLine = await matrixLineOf(newer.id)
    const switched = await save(withReplacement, {
      families: [
        {
          ...withReplacement.version.document.families[0],
          productFamilyId: newer.id,
          lines: withReplacement.version.document.families[0].lines.map((l) => ({ ...l, productLineId: newerLine.id })),
        },
      ],
    })
    expect(switched.familyStatus[0]).toMatchObject({ productFamilyId: newer.id, status: 'current' })
    expect(switched.version.document.families[0].lines[0].unitPrice).toBeCloseTo(CATALOG_UNIT_PRICE, 4)
  })

  it('an invoiced version keeps its prices after its family expires', async () => {
    const family = await importFreshFamily()
    const line = await matrixLineOf(family.id)
    const quote = await newQuote('TEST-Q-SVC-SENT-EXPIRED')
    const saved = await save(quote, { families: [familyOf(family.id, [catalogLine(line.id)])] })
    await setQuoteVersionStatusById(ctx(), actor, quote.quote.id, saved.version.id, 'invoiced')
    await setProductFamilyPriceValidityDates(ctx(), actor, family.id, { priceValidFrom: '2020-01-01', priceValidTo: '2020-12-31' })
    const later = (await getQuote(ctx(), quote.quote.id))!
    expect(later.version.totalPrice).toBe(saved.version.totalPrice)
    expect((await setQuoteVersionStatusById(ctx(), actor, quote.quote.id, saved.version.id, 'accepted')).version.status).toBe('accepted')
  })
})

describe('printing', () => {
  it('gives the version with the company, its first branch and the sales contact', async () => {
    const quote = await newQuote('TEST-Q-SVC-PRINT')
    const data = (await getQuotePrintData(ctx(), quote.quote.id))!
    expect(data.version.version).toBe(1)
    expect(data.company).toMatchObject({ name: 'Quote Service Test Supplier', vatNumber: 'QSVC-SUP' })
    expect(data.businessUnit).toBeNull()
    expect(data.salesContact).toMatchObject({ id: actorUserId, name: 'Quote Tester', email: 'quote-svc-test-actor@example.com' })
    expect(await getQuotePrintData(ctx(), quote.quote.id, 9)).toBeNull()
  })
})

describe('listMyQuotes', () => {
  it("is scoped by effectiveCompanyId even for a super-admin — never every tenant's quotes", async () => {
    await newQuote('TEST-Q-SVC-LIST-SUPPLIER')
    const clientCtx = { effectiveCompanyId: linkedClientCompanyId, isSuperAdmin: false }
    await newQuote('TEST-Q-SVC-LIST-CLIENT', clientCtx, { actorUserId, actorCompanyId: linkedClientCompanyId, requestId: 'test-request' })

    const asSupplier = (await listMyQuotes({ effectiveCompanyId: supplierCompanyId, isSuperAdmin: true })).map((q) => q.reference)
    expect(asSupplier).toContain('TEST-Q-SVC-LIST-SUPPLIER')
    expect(asSupplier).not.toContain('TEST-Q-SVC-LIST-CLIENT')
    const asClient = (await listMyQuotes({ effectiveCompanyId: linkedClientCompanyId, isSuperAdmin: true })).map((q) => q.reference)
    expect(asClient).toContain('TEST-Q-SVC-LIST-CLIENT')
    expect(asClient).not.toContain('TEST-Q-SVC-LIST-SUPPLIER')
  })
})

describe('alternatives, final and archive', () => {
  it('copies one cell forward, then fills the empty cell from the one above', async () => {
    const quote = await newQuote('TEST-Q-SVC-MATRIX')
    const a2 = await createQuoteAlternative(ctx(), actor, quote.quote.id, quote.version.id, { document: quote.version.document })
    expect(a2.version).toMatchObject({ version: 1, alternative: 2, label: null, isFinal: false, status: 'draft' })
    const labeled = await setQuoteVariantLabelById(ctx(), actor, quote.quote.id, a2.version.id, { label: 'Wood' })
    const promoted = await promoteQuoteVariant(ctx(), actor, quote.quote.id, labeled.version.id)
    expect(promoted.version).toMatchObject({ version: 2, alternative: 2, label: 'Wood', status: 'draft', isFinal: false })
    expect(promoted.versions.map((variant) => [variant.version, variant.alternative])).toEqual([
      [1, 1],
      [1, 2],
      [2, 2],
    ])
    // The latest version has no A1, so opening the quote lands on V2A2.
    expect((await getQuote(ctx(), quote.quote.id))!.version).toMatchObject({ version: 2, alternative: 2 })
    const filled = await promoteQuoteVariant(ctx(), actor, quote.quote.id, quote.version.id)
    expect(filled.version).toMatchObject({ version: 2, alternative: 1 })
    expect(filled.versions.map((variant) => [variant.version, variant.alternative])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ])
    await expect(promoteQuoteVariant(ctx(), actor, quote.quote.id, labeled.version.id)).rejects.toThrow(/V2A2 already exists/)

    await setQuoteVariantFinal(ctx(), actor, quote.quote.id, quote.version.id)
    const final = await setQuoteVariantFinal(ctx(), actor, quote.quote.id, labeled.version.id)
    expect(final.versions.filter((variant) => variant.isFinal).map((variant) => [variant.version, variant.alternative])).toEqual([[1, 2]])

    const favorite = await setQuoteVariantFavorite(ctx(), actor, quote.quote.id, labeled.version.id, true)
    expect(favorite.versions.filter((variant) => variant.isFavorite).map((variant) => [variant.version, variant.alternative])).toEqual([[1, 2]])
    const stillFinal = favorite.versions.find((variant) => variant.isFinal)
    expect(stillFinal).toMatchObject({ version: 1, alternative: 2, isFavorite: true })
    expect(favorite.versions.find((variant) => variant.version === 2 && variant.alternative === 2)?.isFavorite).toBe(false)
    expect((await listMyQuotes(ctx(), { favorites: true })).map((row) => row.id)).toContain(quote.quote.id)
    await setQuoteVariantFavorite(ctx(), actor, quote.quote.id, labeled.version.id, false)
    expect((await listMyQuotes(ctx(), { favorites: true })).map((row) => row.id)).not.toContain(quote.quote.id)

    const copy = await duplicateQuoteVariant(ctx(), actor, quote.quote.id, { versionId: labeled.version.id, reference: 'TEST-Q-SVC-MATRIX-COPY' })
    expect(copy.version).toMatchObject({ version: 1, alternative: 1, label: 'Wood' })
    expect(copy.versions).toHaveLength(1)
    expect(copy.quote.reference).toBe('TEST-Q-SVC-MATRIX-COPY')
  })

  it('lets a company admin archive a quote, and refuses a sales user', async () => {
    const quote = await newQuote('TEST-Q-SVC-ARCHIVE')
    const [sales] = await withSystemTransaction(db, async (tx) => {
      await tx.insert(roles).values({ id: 'user', name: 'User', description: 'test role' }).onConflictDoNothing({ target: roles.id })
      return tx
        .insert(users)
        .values({
          cognitoSub: 'quote-svc-test-sales',
          email: 'quote-svc-test-sales@example.com',
          name: 'Sales Associate',
          companyId: supplierCompanyId,
          roleId: 'user',
          status: 'active',
        })
        .returning({ id: users.id })
    })
    try {
      const salesActor = { actorUserId: sales.id, actorCompanyId: supplierCompanyId, requestId: 'test-request' }
      await expect(setQuoteArchived(ctx(), salesActor, quote.quote.id, true)).rejects.toBeInstanceOf(QuoteForbiddenError)
      const archived = await setQuoteArchived(ctx(), actor, quote.quote.id, true)
      expect(archived.archivedAt).toEqual(expect.any(String))
      expect((await listMyQuotes(ctx())).map((row) => row.id)).not.toContain(quote.quote.id)
      expect((await listMyQuotes(ctx(), { includeArchived: true })).map((row) => row.id)).toContain(quote.quote.id)
      expect((await getQuote(ctx(), quote.quote.id))!.quote.archivedAt).toEqual(expect.any(String))
    } finally {
      await withSystemTransaction(db, (tx) => tx.delete(users).where(eq(users.id, sales.id)))
    }
  })

  it('archives one family version and leaves the newer one on the list', async () => {
    const family = await importFreshFamily()
    const newer = await createNewVersionFromExcel(ctx(), actor, family.id, fixtureFile, { readyForInvoicing: true })
    await setProductFamilyArchived(ctx(), actor, family.id, true)
    const visible = (await listProductFamilies(ctx())).map((row) => row.id)
    expect(visible).not.toContain(family.id)
    expect(visible).toContain(newer.id)
    const archived = (await listProductFamilies(ctx(), { includeArchived: true })).find((row) => row.id === family.id)
    expect(archived?.archivedAt).toBeInstanceOf(Date)

    await setProductFamilyFavorite(ctx(), actor, newer.id, true)
    const listed = await listProductFamilies(ctx())
    expect(listed.find((row) => row.id === newer.id)?.isFavorite).toBe(true)
    expect(listed.find((row) => row.id === family.id)?.isFavorite).not.toBe(true)
    await setProductFamilyFavorite(ctx(), actor, newer.id, false)
    expect((await listProductFamilies(ctx())).find((row) => row.id === newer.id)?.isFavorite).toBe(false)
  })
})
