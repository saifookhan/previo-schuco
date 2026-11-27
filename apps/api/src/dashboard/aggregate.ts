import {
  DASHBOARD_PRICE_LIST_SOON_DAYS,
  DASHBOARD_PRICE_LIST_WATCH_DAYS,
  DASHBOARD_STALE_DRAFT_DAYS,
  DASHBOARD_TEST_QUOTE_PREFIX,
  DASHBOARD_TIMEZONE,
  isDashboardTestQuote,
  lineTotal,
  lineTotalM2,
  priceValidityToday,
  quoteDocumentSchema,
  type DashboardPeriod,
  type DashboardQuoteRef,
  type DashboardResponse,
  type DashboardStatusAmounts,
  type QuoteStatus,
} from '@schuco/contracts'

import { addIsoDays, chartBuckets, inRange, periodRange, type TimeRange } from './period'

/**
 * Pure dashboard math. The service loads rows; everything that can be wrong
 * (week boundaries, €0, the TEST prefix, who sees which quote, empty win rate)
 * is decided here so it can be tested without Postgres.
 */

const DAY_MS = 86_400_000
const RECENT_LIMIT = 8
const LIST_LIMIT = 8
const FOLLOW_UP_LIMIT = 15
const TOP_LIMIT = 5

const COMPANY_DASHBOARD_ROLES = new Set(['super-admin', 'company-admin', 'super-user'])

/**
 * Sales associates (`user`) and custom roles see quotes they created.
 * Company admins, sales managers (`super-user`) and super-admins see the company
 * and may filter by creator.
 */
export const dashboardScopeForRoles = (roleIds: readonly string[]): 'own' | 'company' =>
  roleIds.some((roleId) => COMPANY_DASHBOARD_ROLES.has(roleId)) ? 'company' : 'own'

export interface DashboardSourceQuote {
  id: string
  reference: string
  status: QuoteStatus
  customerName: string
  projectLocation: string | null
  totalPrice: string
  /** Version number of the variant this row represents (the x in VxAy). */
  latestVersion: number
  /** Alternative number of that variant (the y in VxAy). */
  alternative: number
  /** True when this variant is the quote's chosen final offer. */
  isFinal: boolean
  /** True when this variant is marked favorite. Favorites pick the open quote. */
  isFavorite: boolean
  createdAt: Date
  updatedAt: Date
  sentAt: Date | null
  createdByUserId: string | null
  createdByName: string | null
  /** Document of the counted variant. Only read for sent and accepted quotes. */
  document: unknown
}

/** One cell of a quote's V×A grid, before the dashboard picks a single variant. */
export interface DashboardVariant {
  version: number
  alternative: number
  isFinal: boolean
  isFavorite: boolean
  status: QuoteStatus
  totalPrice: string
  updatedAt: Date
  sentAt: Date | null
  document: unknown
}

export interface DashboardQuoteGroup {
  id: string
  reference: string
  customerName: string
  projectLocation: string | null
  createdAt: Date
  createdByUserId: string | null
  createdByName: string | null
  variants: DashboardVariant[]
}

const highestVariant = <T extends { version: number; alternative: number }>(variants: readonly T[]): T | null => {
  if (variants.length === 0) return null
  return variants.reduce((best, variant) => {
    if (variant.version !== best.version) return variant.version > best.version ? variant : best
    return variant.alternative > best.alternative ? variant : best
  })
}

/** The one variant the dashboard counts: the quote marked final. Null when none is marked. */
export const pickFinalVariant = <T extends { version: number; alternative: number; isFinal: boolean }>(
  variants: readonly T[],
): T | null => highestVariant(variants.filter((variant) => variant.isFinal))

/**
 * The variant that stands for the quote in the book (funnel, accepted, recent).
 * An accepted variant wins, even when it was never marked final — accepting is the
 * decision, and hiding it behind the final flag is what dropped won quotes off the
 * dashboard. Among several accepted cells, the highest version then alternative.
 * With no acceptance, the variant marked final. With neither, the quote is left out.
 */
export const pickBookVariant = <T extends { version: number; alternative: number; isFinal: boolean; status: string }>(
  variants: readonly T[],
): T | null => {
  const accepted = highestVariant(variants.filter((variant) => variant.status === 'accepted'))
  return accepted ?? pickFinalVariant(variants)
}

/**
 * The open quote: a favorite when one is marked (the highest version, then the
 * highest alternative among favorites). Otherwise the latest cell, highest version
 * then highest alternative.
 */
export const pickOpenVariant = <T extends { version: number; alternative: number; isFavorite: boolean }>(
  variants: readonly T[],
): T | null => {
  const favorites = variants.filter((variant) => variant.isFavorite)
  return highestVariant(favorites.length > 0 ? favorites : variants)
}

const sourceFrom = (group: DashboardQuoteGroup, variant: DashboardVariant): DashboardSourceQuote => ({
  id: group.id,
  reference: group.reference,
  status: variant.status,
  customerName: group.customerName,
  projectLocation: group.projectLocation,
  totalPrice: variant.totalPrice,
  latestVersion: variant.version,
  alternative: variant.alternative,
  isFinal: variant.isFinal,
  isFavorite: variant.isFavorite,
  createdAt: group.createdAt,
  updatedAt: variant.updatedAt,
  sentAt: variant.sentAt,
  createdByUserId: group.createdByUserId,
  createdByName: group.createdByName,
  document: variant.document,
})

/**
 * The book (pipeline, funnel, accepted, recent) is the accepted variant when there is one,
 * otherwise the variant marked final. A quote with neither is left out.
 * Open quotes are a separate pick: favorite if marked, otherwise the latest VxAy, and only while
 * that variant is still draft or invoiced.
 */
export const collapseDashboardQuotes = (
  groups: readonly DashboardQuoteGroup[],
): { counted: DashboardSourceQuote[]; open: DashboardSourceQuote[] } => {
  const counted: DashboardSourceQuote[] = []
  const open: DashboardSourceQuote[] = []
  for (const group of groups) {
    const book = pickBookVariant(group.variants)
    if (book) counted.push(sourceFrom(group, book))
    const opened = pickOpenVariant(group.variants)
    if (opened && (opened.status === 'draft' || opened.status === 'invoiced')) open.push(sourceFrom(group, opened))
  }
  return { counted, open }
}

export interface DashboardStatusEvent {
  quoteId: string
  at: Date
  /** `audit_log.metadata.to` for `quote.set_status`. */
  to: string
}

export interface DashboardFamilySource {
  id: string
  name: string
  category: string | null
  brand: string | null
  isPublished: boolean
  readyForInvoicing: boolean
  priceValidTo: string | null
}

export interface BuildDashboardInput {
  now: Date
  period: DashboardPeriod
  includeTestQuotes: boolean
  scope: 'own' | 'company'
  actorUserId: string
  /** Ignored unless `scope` is `company`. */
  salespersonId: string | null
  /** Quotes that have a final variant. Every figure except open quotes uses these. */
  quotes: DashboardSourceQuote[]
  /**
   * Open quotes: favorite if marked, otherwise the latest VxAy, while that variant is draft or invoiced.
   * When omitted, open quotes are the counted quotes that are still draft or invoiced.
   */
  openQuotes?: DashboardSourceQuote[]
  events: DashboardStatusEvent[]
  families: DashboardFamilySource[]
}

interface MoneyBag {
  count: number
  cents: number
}

const emptyBag = (): MoneyBag => ({ count: 0, cents: 0 })

const emptyStatus = (): Record<QuoteStatus, MoneyBag> => ({
  draft: emptyBag(),
  invoiced: emptyBag(),
  accepted: emptyBag(),
})

/** `quotes.total_price` is numeric(14,2). Non-numeric junk counts as zero. */
export const centsOf = (totalPrice: string): number => {
  const value = Number(totalPrice)
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100)
}

const money = (cents: number): string => (cents / 100).toFixed(2)

const publishBag = (bag: MoneyBag): { count: number; total: string } => ({ count: bag.count, total: money(bag.cents) })

const publishStatus = (bags: Record<QuoteStatus, MoneyBag>): DashboardStatusAmounts => ({
  draft: publishBag(bags.draft),
  invoiced: publishBag(bags.invoiced),
  accepted: publishBag(bags.accepted),
})

const addMoney = (bag: MoneyBag, cents: number) => {
  bag.count += 1
  bag.cents += cents
}

const toRef = (quote: DashboardSourceQuote): DashboardQuoteRef => ({
  id: quote.id,
  reference: quote.reference,
  status: quote.status,
  customerName: quote.customerName,
  projectLocation: quote.projectLocation,
  totalPrice: money(centsOf(quote.totalPrice)),
  latestVersion: quote.latestVersion,
  alternative: quote.alternative,
  isFinal: quote.isFinal,
  isFavorite: quote.isFavorite,
  createdAt: quote.createdAt.toISOString(),
  updatedAt: quote.updatedAt.toISOString(),
  sentAt: quote.sentAt ? quote.sentAt.toISOString() : null,
  createdByUserId: quote.createdByUserId,
  createdByName: quote.createdByName,
})

const listOf = (quotes: DashboardSourceQuote[]) => ({
  count: quotes.length,
  quotes: quotes.slice(0, LIST_LIMIT).map(toRef),
})

const byName = (left: { name: string | null }, right: { name: string | null }) =>
  (left.name ?? '').localeCompare(right.name ?? '', undefined, { sensitivity: 'base' })

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid]!
  return sorted.length % 2 === 1 ? upper : (sorted[mid - 1]! + upper) / 2
}

const capFamilies = <T>(rows: T[]) => ({ count: rows.length, families: rows.slice(0, LIST_LIMIT) })

interface Rank {
  name: string
  cents: number
  count: number
  lineCount: number
  areaM2: number
  /** Highest single-quote total, used to pick a display spelling. */
  best: number
}

const bumpCustomer = (groups: Map<string, Rank>, name: string, cents: number) => {
  const key = name.trim().toLowerCase()
  const display = name.trim() || '—'
  const current = groups.get(key)
  if (!current) {
    groups.set(key, { name: display, cents, count: 1, lineCount: 0, areaM2: 0, best: cents })
    return
  }
  current.cents += cents
  current.count += 1
  if (cents > current.best && display !== '—') {
    current.name = display
    current.best = cents
  }
}

const topCustomers = (groups: Map<string, Rank>) =>
  [...groups.values()]
    .sort((left, right) => right.cents - left.cents || right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, TOP_LIMIT)
    .map((row) => ({ name: row.name, count: row.count, total: money(row.cents) }))

const topCatalog = (groups: Map<string, Rank>) =>
  [...groups.values()]
    .filter((row) => row.lineCount > 0 || row.cents !== 0)
    .sort((left, right) => right.cents - left.cents || right.lineCount - left.lineCount || left.name.localeCompare(right.name))
    .slice(0, TOP_LIMIT)
    .map((row) => ({
      name: row.name,
      total: money(row.cents),
      lineCount: row.lineCount,
      areaM2: Math.round(row.areaM2 * 100) / 100,
    }))

const bumpCatalog = (groups: Map<string, Rank>, key: string, display: string, cents: number, lines: number, area: number) => {
  const current = groups.get(key)
  if (!current) {
    groups.set(key, { name: display, cents, count: 0, lineCount: lines, areaM2: area, best: 0 })
    return
  }
  current.cents += cents
  current.lineCount += lines
  current.areaM2 += area
}

/**
 * Latest accept/reject inside the period. A later rejection cancels an earlier
 * acceptance in the same period. Quotes with no `quote.set_status` history at
 * all fall back to the current status when `updated_at` is in the period.
 */
const periodOutcome = (
  quote: DashboardSourceQuote,
  events: DashboardStatusEvent[],
  range: TimeRange,
): 'accepted' | 'rejected' | null => {
  let latest: DashboardStatusEvent | null = null
  let anyDecision = false
  for (const event of events) {
    if (event.to !== 'accepted' && event.to !== 'rejected') continue
    anyDecision = true
    if (!inRange(event.at, range)) continue
    if (!latest || event.at.getTime() >= latest.at.getTime()) latest = event
  }
  if (latest) return latest.to as 'accepted' | 'rejected'
  if (anyDecision) return null
  if (quote.status === 'accepted' && inRange(quote.updatedAt, range)) return 'accepted'
  return null
}

const latestAcceptanceAt = (events: DashboardStatusEvent[], range: TimeRange, fallback: Date | null): Date | null => {
  let at: Date | null = null
  for (const event of events) {
    if (event.to !== 'accepted' || !inRange(event.at, range)) continue
    if (!at || event.at.getTime() >= at.getTime()) at = event.at
  }
  return at ?? fallback
}

export const buildDashboard = (input: BuildDashboardInput): DashboardResponse => {
  const range = periodRange(input.period, input.now)
  const currentWeek = periodRange('week', input.now)
  const salespersonId = input.scope === 'company' ? input.salespersonId : null

  const visible = (quote: DashboardSourceQuote) =>
    (input.scope === 'company' || quote.createdByUserId === input.actorUserId) &&
    (input.includeTestQuotes || !isDashboardTestQuote(quote)) &&
    (!salespersonId || quote.createdByUserId === salespersonId)
  const permitted = input.quotes.filter((quote) => input.scope === 'company' || quote.createdByUserId === input.actorUserId)
  const hiddenTestQuoteCount = input.includeTestQuotes ? 0 : permitted.filter((quote) => isDashboardTestQuote(quote)).length
  const afterTest = input.includeTestQuotes ? permitted : permitted.filter((quote) => !isDashboardTestQuote(quote))
  const inView = salespersonId ? afterTest.filter((quote) => quote.createdByUserId === salespersonId) : afterTest
  const openView = (input.openQuotes ?? inView).filter(
    (quote) => visible(quote) && (quote.status === 'draft' || quote.status === 'invoiced'),
  )

  const eventsByQuote = new Map<string, DashboardStatusEvent[]>()
  for (const event of input.events) {
    const list = eventsByQuote.get(event.quoteId)
    if (list) list.push(event)
    else eventsByQuote.set(event.quoteId, [event])
  }

  const pipeline = emptyStatus()
  const open = emptyBag()
  const acceptedInPeriod = emptyBag()
  let averageCents = 0
  let averageSample = 0
  let decidedAccepted = 0
  let decidedRejected = 0
  let sentInPeriod = 0
  let sentThenAccepted = 0
  const daysToAccept: number[] = []
  const openCustomers = new Map<string, Rank>()
  const acceptedCustomers = new Map<string, Rank>()
  const families = new Map<string, Rank>()
  const categories = new Map<string, Rank>()
  const byCreator = new Map<string, { userId: string | null; name: string | null; bag: MoneyBag; accepted: MoneyBag }>()

  const buckets = chartBuckets(input.period, input.now)
  const bucketBags = buckets.map(() => emptyStatus())
  const chartWindow =
    input.period === 'week'
      ? { start: buckets[0]!.start, end: buckets[buckets.length - 1]!.end }
      : range

  for (const quote of inView) {
    const cents = centsOf(quote.totalPrice)
    const events = eventsByQuote.get(quote.id) ?? []
    addMoney(pipeline[quote.status], cents)

    const outcome = periodOutcome(quote, events, range)
    if (outcome === 'accepted') {
      decidedAccepted += 1
      addMoney(acceptedInPeriod, cents)
      bumpCustomer(acceptedCustomers, quote.customerName, cents)
    } else if (outcome === 'rejected') {
      decidedRejected += 1
    }

    if (inRange(quote.createdAt, range) && cents !== 0) {
      averageCents += cents
      averageSample += 1
    }

    if (quote.sentAt && inRange(quote.sentAt, range)) {
      sentInPeriod += 1
      if (quote.status === 'accepted') sentThenAccepted += 1
    }

    const acceptanceAt = latestAcceptanceAt(
      events,
      range,
      outcome === 'accepted' && !events.some((event) => event.to === 'accepted') ? quote.updatedAt : null,
    )
    if (acceptanceAt && quote.sentAt) {
      const days = (acceptanceAt.getTime() - quote.sentAt.getTime()) / DAY_MS
      if (days >= 0) daysToAccept.push(days)
    }

    if (inRange(quote.createdAt, chartWindow)) {
      const index = buckets.findIndex((bucket) => inRange(quote.createdAt, bucket))
      if (index >= 0) addMoney(bucketBags[index]![quote.status], cents)
    }

    const creatorKey = quote.createdByUserId ?? ''
    const creator = byCreator.get(creatorKey)
    if (!creator) {
      const bag = emptyBag()
      const accepted = emptyBag()
      addMoney(bag, cents)
      if (quote.status === 'accepted') addMoney(accepted, cents)
      byCreator.set(creatorKey, { userId: quote.createdByUserId, name: quote.createdByName, bag, accepted })
    } else {
      addMoney(creator.bag, cents)
      if (quote.status === 'accepted') addMoney(creator.accepted, cents)
      if (!creator.name && quote.createdByName) creator.name = quote.createdByName
    }

    if (quote.status === 'invoiced' || quote.status === 'accepted') {
      const parsed = quoteDocumentSchema.safeParse(quote.document)
      if (parsed.success) {
        for (const family of parsed.data.families) {
          if (family.isAlternative) continue
          let familyCents = 0
          let lineCount = 0
          let area = 0
          for (const line of family.lines) {
            if (line.isAlternative) continue
            familyCents += Math.round(lineTotal(line) * 100)
            lineCount += 1
            area += lineTotalM2(line) ?? 0
          }
          if (lineCount === 0 && familyCents === 0) continue
          const familyName = family.name.trim() || '—'
          bumpCatalog(families, familyName.toLowerCase(), familyName, familyCents, lineCount, area)
          const categoryName = family.category.trim() || familyName
          bumpCatalog(categories, categoryName.toLowerCase(), categoryName, familyCents, lineCount, area)
        }
      }
    }
  }

  const staleBefore = input.now.getTime() - DASHBOARD_STALE_DRAFT_DAYS * DAY_MS
  const drafts = inView.filter((quote) => quote.status === 'draft')
  const recent = [...inView].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()).slice(0, RECENT_LIMIT)
  const followUp = inView
    .filter((quote) => quote.status === 'invoiced')
    .map((quote) => ({
      quote,
      daysSinceSent: quote.sentAt ? Math.max(0, Math.floor((input.now.getTime() - quote.sentAt.getTime()) / DAY_MS)) : null,
    }))
    .sort((left, right) => {
      if (left.daysSinceSent === null) return 1
      if (right.daysSinceSent === null) return -1
      return right.daysSinceSent - left.daysSinceSent
    })
    .slice(0, FOLLOW_UP_LIMIT)

  for (const quote of openView) {
    addMoney(open, centsOf(quote.totalPrice))
    bumpCustomer(openCustomers, quote.customerName, centsOf(quote.totalPrice))
  }

  const salespeopleSource = afterTest
  const salespersonNames = new Map<string, string | null>()
  for (const quote of salespeopleSource) {
    if (!quote.createdByUserId) continue
    if (!salespersonNames.has(quote.createdByUserId)) salespersonNames.set(quote.createdByUserId, quote.createdByName)
    else if (!salespersonNames.get(quote.createdByUserId) && quote.createdByName) {
      salespersonNames.set(quote.createdByUserId, quote.createdByName)
    }
  }

  const today = priceValidityToday(input.now)
  const soon = addIsoDays(today, DASHBOARD_PRICE_LIST_SOON_DAYS)
  const watch = addIsoDays(today, DASHBOARD_PRICE_LIST_WATCH_DAYS)
  const healthOf = (family: DashboardFamilySource) => ({
    id: family.id,
    name: family.name,
    category: family.category,
    brand: family.brand,
    priceValidTo: family.priceValidTo,
  })
  const byValidTo = (left: DashboardFamilySource, right: DashboardFamilySource) =>
    (left.priceValidTo ?? '').localeCompare(right.priceValidTo ?? '') || left.name.localeCompare(right.name)
  const expired = input.families.filter((family) => family.priceValidTo !== null && family.priceValidTo < today).sort(byValidTo)
  const expiring14 = input.families
    .filter((family) => family.priceValidTo !== null && family.priceValidTo >= today && family.priceValidTo <= soon)
    .sort(byValidTo)
  const expiring30 = input.families
    .filter((family) => family.priceValidTo !== null && family.priceValidTo > soon && family.priceValidTo <= watch)
    .sort(byValidTo)
  const unpublished = input.families.filter((family) => !family.isPublished).sort((left, right) => left.name.localeCompare(right.name))
  const notReady = input.families
    .filter((family) => !family.readyForInvoicing)
    .sort((left, right) => left.name.localeCompare(right.name))

  const decided = decidedAccepted + decidedRejected

  return {
    period: input.period,
    periodStart: range.startYmd,
    periodEnd: range.endYmd,
    timezone: DASHBOARD_TIMEZONE,
    includeTestQuotes: input.includeTestQuotes,
    testQuotePrefix: DASHBOARD_TEST_QUOTE_PREFIX,
    hiddenTestQuoteCount,
    scope: input.scope,
    salespersonId,
    salespeople:
      input.scope === 'company'
        ? [...salespersonNames.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort(byName)
        : [],
    kpis: {
      openQuotes: publishBag(open),
      pipelineByStatus: publishStatus(pipeline),
      acceptedInPeriod: publishBag(acceptedInPeriod),
      averageQuoteValue: averageSample === 0 ? null : money(Math.round(averageCents / averageSample)),
      averageQuoteSample: averageSample,
    },
    funnel: publishStatus(pipeline),
    recentQuotes: recent.map(toRef),
    attention: {
      staleAfterDays: DASHBOARD_STALE_DRAFT_DAYS,
      staleDrafts: listOf(drafts.filter((quote) => quote.updatedAt.getTime() < staleBefore).sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime())),
      zeroDrafts: listOf(drafts.filter((quote) => centsOf(quote.totalPrice) === 0).sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())),
      editedThisWeek: listOf(
        [...inView]
          .filter((quote) => inRange(quote.updatedAt, currentWeek))
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()),
      ),
    },
    overTime: {
      bucket: input.period === 'year' ? 'month' : 'week',
      points: buckets.map((bucket, index) => ({
        start: bucket.startYmd,
        end: bucket.endYmd,
        byStatus: publishStatus(bucketBags[index]!),
      })),
    },
    priceListHealth: {
      soonDays: DASHBOARD_PRICE_LIST_SOON_DAYS,
      watchDays: DASHBOARD_PRICE_LIST_WATCH_DAYS,
      expired: capFamilies(expired.map(healthOf)),
      expiringWithin14Days: capFamilies(expiring14.map(healthOf)),
      expiringWithin30Days: capFamilies(expiring30.map(healthOf)),
      unpublished: capFamilies(unpublished.map(healthOf)),
      notReadyForInvoicing: capFamilies(notReady.map(healthOf)),
    },
    followUp: followUp.map((row) => ({ quote: toRef(row.quote), daysSinceSent: row.daysSinceSent })),
    winRate: {
      acceptedOverDecided: decided === 0 ? null : decidedAccepted / decided,
      acceptedOverSent: sentInPeriod === 0 ? null : sentThenAccepted / sentInPeriod,
      medianDaysToAccept: median(daysToAccept),
      accepted: decidedAccepted,
      rejected: decidedRejected,
      sent: sentInPeriod,
      timedAcceptances: daysToAccept.length,
    },
    perSalesperson:
      input.scope === 'company'
        ? [...byCreator.values()]
            .map((row) => ({
              userId: row.userId,
              name: row.name,
              quotes: row.bag.count,
              total: money(row.bag.cents),
              acceptedTotal: money(row.accepted.cents),
            }))
            .sort((left, right) => centsOf(right.total) - centsOf(left.total) || (left.name ?? '').localeCompare(right.name ?? ''))
        : null,
    topCustomers: {
      byOpenPipeline: topCustomers(openCustomers),
      byAccepted: topCustomers(acceptedCustomers),
    },
    topFamilies: topCatalog(families),
    topCategories: topCatalog(categories),
  }
}
