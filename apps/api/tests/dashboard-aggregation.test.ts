import {
  dashboardResponseSchema,
  defaultQuotePrintSettings,
  type QuoteDocument,
  type QuoteFamily,
  type QuoteLine,
} from '@schuco/contracts'
import { describe, expect, it } from 'vitest'

import { buildDashboard, dashboardScopeForRoles, type BuildDashboardInput, type DashboardFamilySource, type DashboardSourceQuote, type DashboardStatusEvent } from '../src/dashboard/aggregate'
import { chartBuckets, periodRange } from '../src/dashboard/period'

/**
 * Aggregation only — no database. `now` is Friday 27 Nov 2026, 11:00 in Rome,
 * so the current sales week is Thursday 26 Nov through Wednesday 2 Dec.
 */

const NOW = new Date('2026-11-27T10:00:00.000Z')
const WEEK_START = new Date('2026-11-25T23:00:00.000Z')
const WEEK_END = new Date('2026-12-02T23:00:00.000Z')

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const USER_A = id(10)
const USER_B = id(11)

const quote = (overrides: Partial<DashboardSourceQuote> = {}): DashboardSourceQuote => ({
  id: id(1),
  reference: 'PRV-1',
  status: 'draft',
  customerName: 'Rossi',
  projectLocation: null,
  totalPrice: '100.00',
  latestVersion: 1,
  createdAt: new Date('2026-11-26T10:00:00.000Z'),
  updatedAt: new Date('2026-11-26T10:00:00.000Z'),
  sentAt: null,
  createdByUserId: USER_A,
  createdByName: 'Ada',
  document: null,
  ...overrides,
})

const build = (overrides: Partial<BuildDashboardInput> = {}) =>
  buildDashboard({
    now: NOW,
    period: 'week',
    includeTestQuotes: false,
    scope: 'company',
    actorUserId: USER_A,
    salespersonId: null,
    quotes: [],
    events: [],
    families: [],
    ...overrides,
  })

const line = (overrides: Partial<QuoteLine> = {}): QuoteLine => ({
  id: 'l1',
  code: 'P01',
  productLineId: null,
  name: 'Line',
  quantity: 2,
  unit: 'pz',
  widthMm: 1000,
  heightMm: 1000,
  options: [],
  priceMode: 'manual',
  unitPrice: 100,
  extraMarkupPct: 0,
  discountPct: 0,
  vatRate: '22%',
  installationHours: null,
  locked: false,
  isAlternative: false,
  ...overrides,
})

const family = (overrides: Partial<QuoteFamily> = {}): QuoteFamily => ({
  id: 'f1',
  productFamilyId: null,
  name: 'Finestre',
  category: 'Serramenti',
  isAlternative: false,
  description: '',
  notes: '',
  lines: [line()],
  ...overrides,
})

const document = (families: QuoteFamily[]): QuoteDocument => ({
  header: {
    customerName: 'Rossi',
    customerFiscalCode: null,
    customerAddress: null,
    customerCity: null,
    projectLocation: null,
    quoteDate: '2026-11-26',
    notes: '',
  },
  intro: [],
  families,
  closing: [],
  printSettings: defaultQuotePrintSettings,
})

const catalogFamily = (overrides: Partial<DashboardFamilySource> = {}): DashboardFamilySource => ({
  id: id(40),
  name: 'AWS 75',
  category: 'Finestre',
  brand: 'Schuco',
  isPublished: true,
  readyForInvoicing: true,
  priceValidTo: '2026-12-31',
  ...overrides,
})

describe('dashboard periods (Europe/Rome, Thursday–Wednesday)', () => {
  it('bounds the current week at Thursday 00:00 and next Thursday 00:00', () => {
    const week = periodRange('week', NOW)
    expect(week.startYmd).toBe('2026-11-26')
    expect(week.endYmd).toBe('2026-12-03')
    expect(week.start.toISOString()).toBe(WEEK_START.toISOString())
    expect(week.end.toISOString()).toBe(WEEK_END.toISOString())
  })

  it('keeps the Thursday week across the spring daylight-saving change', () => {
    // 29 Mar 2026 03:30 Rome is still the week that opened on Thursday 26 Mar, before the clocks jumped.
    const week = periodRange('week', new Date('2026-03-29T01:30:00.000Z'))
    expect(week.startYmd).toBe('2026-03-26')
    expect(week.start.toISOString()).toBe('2026-03-25T23:00:00.000Z')
    const beforeJump = periodRange('week', new Date('2026-03-28T23:30:00.000Z'))
    expect(beforeJump.startYmd).toBe('2026-03-26')
  })

  it('uses calendar month and year, and buckets weeks or months to match', () => {
    expect(periodRange('month', NOW)).toMatchObject({ startYmd: '2026-11-01', endYmd: '2026-12-01' })
    expect(periodRange('month', NOW).start.toISOString()).toBe('2026-10-31T23:00:00.000Z')
    expect(periodRange('year', NOW)).toMatchObject({ startYmd: '2026-01-01', endYmd: '2027-01-01' })

    const weeks = chartBuckets('week', NOW)
    expect(weeks).toHaveLength(8)
    expect(weeks[0]!.startYmd).toBe('2026-10-08')
    expect(weeks[7]!.startYmd).toBe('2026-11-26')
    expect(chartBuckets('month', NOW).map((bucket) => bucket.startYmd)).toEqual([
      '2026-10-29',
      '2026-11-05',
      '2026-11-12',
      '2026-11-19',
      '2026-11-26',
    ])
    const months = chartBuckets('year', NOW)
    expect(months).toHaveLength(12)
    expect(months[0]!.startYmd).toBe('2026-01-01')
    expect(months[11]!.startYmd).toBe('2026-12-01')
  })

  it('puts a quote created on the Wednesday/Thursday boundary in the right week bar', () => {
    const previous = quote({
      id: id(1),
      createdAt: new Date('2026-11-25T22:59:00.000Z'),
      status: 'draft',
      totalPrice: '5.00',
    })
    const opening = quote({
      id: id(2),
      createdAt: new Date('2026-11-25T23:00:00.000Z'),
      status: 'sent',
      totalPrice: '8.00',
    })
    const closing = quote({
      id: id(3),
      createdAt: new Date('2026-12-02T22:59:00.000Z'),
      status: 'accepted',
      totalPrice: '13.00',
    })
    const next = quote({
      id: id(4),
      createdAt: new Date('2026-12-02T23:00:00.000Z'),
      status: 'rejected',
      totalPrice: '21.00',
    })
    const result = build({ quotes: [previous, opening, closing, next] })
    const byStart = Object.fromEntries(result.overTime.points.map((point) => [point.start, point.byStatus]))
    expect(byStart['2026-11-19']).toMatchObject({ draft: { count: 1, total: '5.00' } })
    expect(byStart['2026-11-26']).toMatchObject({
      sent: { count: 1, total: '8.00' },
      accepted: { count: 1, total: '13.00' },
      draft: { count: 0, total: '0.00' },
    })
    expect(byStart['2026-12-03']).toBeUndefined()
    const beforeMonth = quote({ id: id(5), createdAt: new Date('2026-10-30T11:00:00.000Z'), status: 'draft', totalPrice: '5.00' })
    const firstOfMonth = quote({ id: id(6), createdAt: new Date('2026-11-01T11:00:00.000Z'), status: 'sent', totalPrice: '8.00' })
    const month = build({ period: 'month', quotes: [beforeMonth, firstOfMonth] })
    const octoberWeek = month.overTime.points.find((point) => point.start === '2026-10-29')!
    expect(octoberWeek.byStatus.draft.count).toBe(0)
    expect(octoberWeek.byStatus.sent).toEqual({ count: 1, total: '8.00' })
  })
})

describe('dashboard quote selection', () => {
  const mine = quote({ id: id(1), createdByUserId: USER_A, createdByName: 'Ada', totalPrice: '10.00' })
  const theirs = quote({ id: id(2), createdByUserId: USER_B, createdByName: 'Bea', totalPrice: '40.00' })

  it('limits a sales associate to their own quotes and ignores a salesperson filter', () => {
    const result = build({ scope: 'own', actorUserId: USER_A, salespersonId: USER_B, quotes: [mine, theirs] })
    expect(result.scope).toBe('own')
    expect(result.salespersonId).toBeNull()
    expect(result.kpis.openQuotes).toEqual({ count: 1, total: '10.00' })
    expect(result.perSalesperson).toBeNull()
    expect(result.salespeople).toEqual([])
  })

  it('lets a company view filter by creator and still lists every creator', () => {
    const filtered = build({ quotes: [mine, theirs], salespersonId: USER_B })
    expect(filtered.kpis.openQuotes).toEqual({ count: 1, total: '40.00' })
    expect(filtered.perSalesperson).toEqual([
      { userId: USER_B, name: 'Bea', quotes: 1, total: '40.00', acceptedTotal: '0.00' },
    ])
    expect(filtered.salespeople).toEqual([
      { id: USER_A, name: 'Ada' },
      { id: USER_B, name: 'Bea' },
    ])
  })

  it('treats admin and manager roles as company-wide and everyone else as own quotes', () => {
    expect(dashboardScopeForRoles(['user'])).toBe('own')
    expect(dashboardScopeForRoles(['custom-sales'])).toBe('own')
    expect(dashboardScopeForRoles(['user', 'super-user'])).toBe('company')
    expect(dashboardScopeForRoles(['company-admin'])).toBe('company')
    expect(dashboardScopeForRoles(['super-admin'])).toBe('company')
  })

  it('hides quotes whose customer or reference starts with TEST, unless asked not to', () => {
    const rows = [
      quote({ id: id(1), customerName: '  Test Foo', reference: 'PRV-1', totalPrice: '1.00' }),
      quote({ id: id(2), customerName: 'Rossi', reference: 'test-99', totalPrice: '2.00' }),
      quote({ id: id(3), customerName: 'Contest', reference: 'PRV-3', totalPrice: '5.00' }),
      quote({ id: id(4), customerName: 'Latest', reference: 'ATTEST-1', totalPrice: '7.00' }),
    ]
    const hidden = build({ quotes: rows })
    expect(hidden.hiddenTestQuoteCount).toBe(2)
    expect(hidden.testQuotePrefix).toBe('TEST')
    expect(hidden.kpis.openQuotes).toEqual({ count: 2, total: '12.00' })
    const shown = build({ quotes: rows, includeTestQuotes: true })
    expect(shown.hiddenTestQuoteCount).toBe(0)
    expect(shown.kpis.openQuotes.count).toBe(4)
  })
})

describe('dashboard figures', () => {
  it('excludes €0 quotes from the average and still counts them as open', () => {
    const result = build({
      quotes: [
        quote({ id: id(1), totalPrice: '0' }),
        quote({ id: id(2), totalPrice: '0.00' }),
        quote({ id: id(3), totalPrice: '10.00' }),
        quote({ id: id(4), totalPrice: '30.00' }),
        quote({ id: id(5), totalPrice: '100.00', createdAt: new Date('2026-11-20T10:00:00.000Z') }),
      ],
    })
    expect(result.kpis.averageQuoteValue).toBe('20.00')
    expect(result.kpis.averageQuoteSample).toBe(2)
    expect(result.kpis.openQuotes).toEqual({ count: 5, total: '140.00' })
    expect(result.kpis.averageQuoteValue).not.toBeNull()
    expect(build().kpis.averageQuoteValue).toBeNull()
  })

  it('flags stale drafts only after 14 days, €0 drafts, and edits in the current week', () => {
    const result = build({
      period: 'year',
      quotes: [
        quote({ id: id(1), updatedAt: new Date('2026-11-13T09:59:59.999Z'), totalPrice: '10.00' }),
        quote({ id: id(2), updatedAt: new Date('2026-11-13T10:00:00.000Z'), totalPrice: '0.00' }),
        quote({ id: id(3), updatedAt: new Date('2026-11-20T10:00:00.000Z'), totalPrice: '4.00' }),
        quote({ id: id(4), status: 'sent', updatedAt: new Date('2026-11-26T12:00:00.000Z'), totalPrice: '9.00', sentAt: NOW }),
      ],
    })
    expect(result.attention.staleAfterDays).toBe(14)
    expect(result.attention.staleDrafts.count).toBe(1)
    expect(result.attention.staleDrafts.quotes.map((row) => row.id)).toEqual([id(1)])
    expect(result.attention.zeroDrafts.quotes.map((row) => row.id)).toEqual([id(2)])
    expect(result.attention.editedThisWeek.count).toBe(1)
    expect(result.attention.editedThisWeek.quotes.map((row) => row.id)).toEqual([id(4)])
  })

  it('ranks sent quotes by days since sent_at and reports an empty win rate', () => {
    const older = quote({
      id: id(1),
      status: 'sent',
      sentAt: new Date(NOW.getTime() - 10.5 * 86_400_000),
      totalPrice: '15.00',
    })
    const newer = quote({
      id: id(2),
      status: 'sent',
      sentAt: new Date(NOW.getTime() - 1.2 * 86_400_000),
      totalPrice: '16.00',
    })
    const missing = quote({ id: id(3), status: 'sent', sentAt: null, totalPrice: '17.00' })
    const result = build({ quotes: [newer, missing, older] })
    expect(result.followUp.map((row) => [row.quote.id, row.daysSinceSent])).toEqual([
      [id(1), 10],
      [id(2), 1],
      [id(3), null],
    ])
    expect(result.winRate).toMatchObject({
      acceptedOverDecided: null,
      acceptedOverSent: 0,
      medianDaysToAccept: null,
      accepted: 0,
      rejected: 0,
      sent: 1,
      timedAcceptances: 0,
    })
    expect(build().winRate.acceptedOverSent).toBeNull()
  })

  it('computes win rate, median days and accepted € from status events', () => {
    const sentAt = new Date('2026-11-26T10:00:00.000Z')
    const accepted = quote({ id: id(1), status: 'accepted', totalPrice: '80.00', sentAt, customerName: '  Rossi  ' })
    const rejected = quote({ id: id(2), status: 'rejected', totalPrice: '20.00', sentAt, customerName: 'Bianchi' })
    const stillSent = quote({ id: id(3), status: 'sent', totalPrice: '10.00', sentAt, customerName: 'rossi' })
    const events: DashboardStatusEvent[] = [
      { quoteId: id(1), at: new Date('2026-11-28T10:00:00.000Z'), to: 'accepted' },
      { quoteId: id(2), at: new Date('2026-11-27T10:00:00.000Z'), to: 'rejected' },
    ]
    const result = build({ quotes: [accepted, rejected, stillSent], events })
    expect(result.kpis.acceptedInPeriod).toEqual({ count: 1, total: '80.00' })
    expect(result.winRate.acceptedOverDecided).toBeCloseTo(0.5)
    expect(result.winRate.acceptedOverSent).toBeCloseTo(1 / 3)
    expect(result.winRate.medianDaysToAccept).toBeCloseTo(2)
    expect(result.winRate.timedAcceptances).toBe(1)
    expect(result.topCustomers.byOpenPipeline).toEqual([{ name: 'rossi', count: 1, total: '10.00' }])
    expect(result.topCustomers.byAccepted).toEqual([{ name: 'Rossi', count: 1, total: '80.00' }])
  })

  it('uses the latest decision in the period, and has no median without a usable sent date', () => {
    const sentAt = new Date('2026-11-29T10:00:00.000Z')
    const flipped = quote({ id: id(1), status: 'rejected', totalPrice: '50.00', sentAt })
    const events: DashboardStatusEvent[] = [
      { quoteId: id(1), at: new Date('2026-11-26T12:00:00.000Z'), to: 'accepted' },
      { quoteId: id(1), at: new Date('2026-11-28T12:00:00.000Z'), to: 'rejected' },
    ]
    const result = build({ quotes: [flipped], events })
    expect(result.kpis.acceptedInPeriod).toEqual({ count: 0, total: '0.00' })
    expect(result.winRate).toMatchObject({ accepted: 0, rejected: 1, acceptedOverDecided: 0, medianDaysToAccept: null, timedAcceptances: 0 })

    const noSent = quote({ id: id(2), status: 'accepted', totalPrice: '5.00', sentAt: null, updatedAt: NOW })
    const undated = build({ quotes: [noSent], events: [{ quoteId: id(2), at: NOW, to: 'accepted' }] })
    expect(undated.winRate.acceptedOverDecided).toBe(1)
    expect(undated.winRate.medianDaysToAccept).toBeNull()
    expect(undated.kpis.acceptedInPeriod.total).toBe('5.00')
  })

  it('takes the median of several acceptance delays and ignores a negative one', () => {
    const delays = [1, 3, 9]
    const quotes = delays.map((days, index) =>
      quote({
        id: id(index + 1),
        status: 'accepted',
        sentAt: new Date('2026-11-26T00:00:00.000Z'),
        totalPrice: '10.00',
      }),
    )
    const events = delays.map((days, index) => ({
      quoteId: id(index + 1),
      at: new Date(new Date('2026-11-26T00:00:00.000Z').getTime() + days * 86_400_000),
      to: 'accepted',
    }))
    expect(build({ period: 'year', quotes, events }).winRate.medianDaysToAccept).toBe(3)

    const even = build({
      quotes: quotes.slice(0, 2),
      events: [
        { quoteId: id(1), at: new Date('2026-11-27T00:00:00.000Z'), to: 'accepted' },
        { quoteId: id(2), at: new Date('2026-11-29T00:00:00.000Z'), to: 'accepted' },
      ],
    })
    expect(even.winRate.medianDaysToAccept).toBe(2)

    const backwards = build({
      quotes: [quote({ id: id(1), status: 'accepted', sentAt: new Date('2026-11-28T00:00:00.000Z') })],
      events: [{ quoteId: id(1), at: new Date('2026-11-26T00:00:00.000Z'), to: 'accepted' }],
    })
    expect(backwards.winRate.medianDaysToAccept).toBeNull()
    expect(backwards.winRate.accepted).toBe(1)
  })

  it('falls back to the current status only when the quote has no decision history', () => {
    const fallback = quote({
      id: id(1),
      status: 'accepted',
      totalPrice: '12.00',
      updatedAt: NOW,
      sentAt: new Date(NOW.getTime() - 2 * 86_400_000),
    })
    const fromHistory = build({ quotes: [fallback] })
    expect(fromHistory.kpis.acceptedInPeriod.total).toBe('12.00')
    expect(fromHistory.winRate.medianDaysToAccept).toBeCloseTo(2)

    const alreadyDecided = quote({ id: id(2), status: 'accepted', totalPrice: '9.00', updatedAt: NOW, sentAt: NOW })
    const outside = build({
      quotes: [alreadyDecided],
      events: [{ quoteId: id(2), at: new Date('2026-10-01T10:00:00.000Z'), to: 'accepted' }],
    })
    expect(outside.kpis.acceptedInPeriod).toEqual({ count: 0, total: '0.00' })
    expect(outside.winRate.acceptedOverDecided).toBeNull()
  })

  it('sums families and categories from sent and accepted documents, with m², skipping alternatives and drafts', () => {
    const sent = quote({
      id: id(1),
      status: 'sent',
      totalPrice: '200.00',
      document: document([
        family(),
        family({ id: 'f-alt', name: 'Ignored', isAlternative: true, lines: [line({ id: 'lx', unitPrice: 500 })] }),
        family({
          id: 'f2',
          name: 'Porte',
          category: '',
          lines: [line({ id: 'l2', quantity: 1, unitPrice: 40, widthMm: null, heightMm: null, isAlternative: true })],
        }),
      ]),
    })
    const accepted = quote({
      id: id(2),
      status: 'accepted',
      totalPrice: '50.00',
      document: document([family({ id: 'f3', name: ' finestre ', lines: [line({ id: 'l3', quantity: 1, unitPrice: 50, widthMm: 500, heightMm: 500 })] })]),
    })
    const draft = quote({
      id: id(3),
      status: 'draft',
      document: document([family({ name: 'Should not count', lines: [line({ unitPrice: 999 })] })]),
    })
    const result = build({ quotes: [sent, accepted, draft] })
    expect(result.topFamilies).toEqual([
      { name: 'Finestre', total: '250.00', lineCount: 2, areaM2: 2.25 },
    ])
    expect(result.topCategories).toEqual([
      { name: 'Serramenti', total: '250.00', lineCount: 2, areaM2: 2.25 },
    ])
  })

  it('groups price lists into expired, 14 days, 15–30 days, unpublished and not ready', () => {
    const result = build({
      families: [
        catalogFamily({ id: id(1), name: 'Old', priceValidTo: '2026-11-26', isPublished: false }),
        catalogFamily({ id: id(2), name: 'Today', priceValidTo: '2026-11-27' }),
        catalogFamily({ id: id(3), name: 'Soon', priceValidTo: '2026-12-11' }),
        catalogFamily({ id: id(4), name: 'Later', priceValidTo: '2026-12-12' }),
        catalogFamily({ id: id(5), name: 'Edge', priceValidTo: '2026-12-27', readyForInvoicing: false }),
        catalogFamily({ id: id(6), name: 'Far', priceValidTo: '2026-12-28' }),
        catalogFamily({ id: id(7), name: 'Open', priceValidTo: null }),
      ],
    })
    expect(result.priceListHealth.expired.families.map((row) => row.name)).toEqual(['Old'])
    expect(result.priceListHealth.expiringWithin14Days.families.map((row) => row.name)).toEqual(['Today', 'Soon'])
    expect(result.priceListHealth.expiringWithin30Days.families.map((row) => row.name)).toEqual(['Later', 'Edge'])
    expect(result.priceListHealth.unpublished.families.map((row) => row.name)).toEqual(['Old'])
    expect(result.priceListHealth.notReadyForInvoicing.families.map((row) => row.name)).toEqual(['Edge'])
  })

  it('matches the dashboard response schema', () => {
    const result = build({
      quotes: [quote({ status: 'sent', sentAt: NOW, totalPrice: '15.50' })],
      families: [catalogFamily()],
    })
    expect(dashboardResponseSchema.parse(result)).toMatchObject({ period: 'week', timezone: 'Europe/Rome' })
  })
})
