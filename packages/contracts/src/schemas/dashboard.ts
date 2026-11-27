import { z } from 'zod'

import { quoteStatusSchema } from './quote-versions'

/**
 * Sales dashboard (`GET /api/dashboard`).
 *
 * Weeks run Thursday 00:00 through Wednesday, in Europe/Rome — the same clock as price-list
 * validity. Totals are IVA excluded and use `quotes.total_price` (numeric, two decimals).
 *
 * Test quotes: a quote whose customer name or reference starts with "TEST" (trimmed,
 * case-insensitive) is hidden unless `includeTest=1`. The demo database is full of chat-test
 * drafts; the prefix is the whole filter, on purpose.
 */
export const DASHBOARD_TEST_QUOTE_PREFIX = 'TEST'
export const DASHBOARD_STALE_DRAFT_DAYS = 14
export const DASHBOARD_PRICE_LIST_SOON_DAYS = 14
export const DASHBOARD_PRICE_LIST_WATCH_DAYS = 30
export const DASHBOARD_TIMEZONE = 'Europe/Rome' as const

/** Customer or reference begins with {@link DASHBOARD_TEST_QUOTE_PREFIX}. */
export const isDashboardTestQuote = (quote: { customerName: string; reference: string }): boolean => {
  const prefix = DASHBOARD_TEST_QUOTE_PREFIX.toLowerCase()
  const customer = quote.customerName.trim().toLowerCase()
  const reference = quote.reference.trim().toLowerCase()
  return customer.startsWith(prefix) || reference.startsWith(prefix)
}

export const dashboardPeriodSchema = z.enum(['week', 'month', 'year'])
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>

const countTotalSchema = z.object({
  count: z.number().int().nonnegative(),
  /** IVA excluded, two decimals, same unit as `quotes.total_price`. */
  total: z.string(),
})
export type DashboardCountTotal = z.infer<typeof countTotalSchema>

const statusAmountsSchema = z.object({
  draft: countTotalSchema,
  sent: countTotalSchema,
  accepted: countTotalSchema,
  rejected: countTotalSchema,
})
export type DashboardStatusAmounts = z.infer<typeof statusAmountsSchema>

export const dashboardQuoteRefSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  status: quoteStatusSchema,
  customerName: z.string(),
  projectLocation: z.string().nullable(),
  totalPrice: z.string(),
  latestVersion: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sentAt: z.string().datetime().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  createdByName: z.string().nullable(),
})
export type DashboardQuoteRef = z.infer<typeof dashboardQuoteRefSchema>

const quoteListSchema = z.object({
  count: z.number().int().nonnegative(),
  quotes: z.array(dashboardQuoteRefSchema),
})

const familyHealthSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  priceValidTo: z.string().nullable(),
})

const familyHealthListSchema = z.object({
  count: z.number().int().nonnegative(),
  families: z.array(familyHealthSchema),
})

const customerRankSchema = z.object({
  /** Trimmed display name. Grouped case-insensitively. */
  name: z.string(),
  count: z.number().int().nonnegative(),
  total: z.string(),
})

const catalogRankSchema = z.object({
  name: z.string(),
  total: z.string(),
  lineCount: z.number().int().nonnegative(),
  /** Sum of quantity × width × height for lines that have both sizes. Alternative lines are left out. */
  areaM2: z.number(),
})

const rateSchema = z.number().nullable()

export const dashboardResponseSchema = z.object({
  period: dashboardPeriodSchema,
  /** Inclusive start, `YYYY-MM-DD` in Europe/Rome. */
  periodStart: z.string(),
  /** Exclusive end, `YYYY-MM-DD` in Europe/Rome. */
  periodEnd: z.string(),
  timezone: z.literal(DASHBOARD_TIMEZONE),
  includeTestQuotes: z.boolean(),
  testQuotePrefix: z.literal(DASHBOARD_TEST_QUOTE_PREFIX),
  /** Quotes hidden by the TEST prefix filter (0 when the filter is off). */
  hiddenTestQuoteCount: z.number().int().nonnegative(),
  scope: z.enum(['own', 'company']),
  salespersonId: z.string().uuid().nullable(),
  /** Creators in the company view, before the salesperson filter. Empty when `scope` is `own`. */
  salespeople: z.array(z.object({ id: z.string().uuid(), name: z.string().nullable() })),
  kpis: z.object({
    /** Current draft + sent quotes. Not limited to the period. */
    openQuotes: countTotalSchema,
    /** Current book by status. Not limited to the period. */
    pipelineByStatus: statusAmountsSchema,
    /** Quotes whose latest accept/reject in the period is accept. Amount is the quote's current total. */
    acceptedInPeriod: countTotalSchema,
    /** Mean total of quotes created in the period, skipping €0. Null when none qualify. */
    averageQuoteValue: z.string().nullable(),
    averageQuoteSample: z.number().int().nonnegative(),
  }),
  /** Same figures as `kpis.pipelineByStatus`: draft → sent → accepted / rejected, current book. */
  funnel: statusAmountsSchema,
  recentQuotes: z.array(dashboardQuoteRefSchema),
  attention: z.object({
    staleAfterDays: z.literal(DASHBOARD_STALE_DRAFT_DAYS),
    staleDrafts: quoteListSchema,
    zeroDrafts: quoteListSchema,
    /** Quotes saved during the current Thursday–Wednesday week, whatever `period` is. */
    editedThisWeek: quoteListSchema,
  }),
  overTime: z.object({
    /** `week` for the week and month views (Thu–Wed buckets); `month` for the year view. */
    bucket: z.enum(['week', 'month']),
    points: z.array(
      z.object({
        start: z.string(),
        end: z.string(),
        byStatus: statusAmountsSchema,
      }),
    ),
  }),
  priceListHealth: z.object({
    soonDays: z.literal(DASHBOARD_PRICE_LIST_SOON_DAYS),
    watchDays: z.literal(DASHBOARD_PRICE_LIST_WATCH_DAYS),
    expired: familyHealthListSchema,
    /** `price_valid_to` is today or within 14 days. */
    expiringWithin14Days: familyHealthListSchema,
    /** `price_valid_to` is 15–30 days out. The 14-day group is not repeated here. */
    expiringWithin30Days: familyHealthListSchema,
    unpublished: familyHealthListSchema,
    notReadyForInvoicing: familyHealthListSchema,
  }),
  followUp: z.array(
    z.object({
      quote: dashboardQuoteRefSchema,
      /** Whole days since the latest version's `sent_at`. Null when that timestamp is missing. */
      daysSinceSent: z.number().int().nullable(),
    }),
  ),
  winRate: z.object({
    /** Accepted ÷ (accepted + rejected) for decisions in the period. Null when that sample is empty. */
    acceptedOverDecided: rateSchema,
    /** Of quotes sent in the period, the share whose current status is accepted. Null when none were sent. */
    acceptedOverSent: rateSchema,
    /** Median days from `sent_at` to the acceptance event. Null when no pair exists. */
    medianDaysToAccept: rateSchema,
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    sent: z.number().int().nonnegative(),
    timedAcceptances: z.number().int().nonnegative(),
  }),
  /** Null for a sales associate (they only see their own quotes). */
  perSalesperson: z
    .array(
      z.object({
        userId: z.string().uuid().nullable(),
        name: z.string().nullable(),
        quotes: z.number().int().nonnegative(),
        total: z.string(),
        acceptedTotal: z.string(),
      }),
    )
    .nullable(),
  topCustomers: z.object({
    byOpenPipeline: z.array(customerRankSchema),
    byAccepted: z.array(customerRankSchema),
  }),
  /** Latest documents of sent and accepted quotes. Alternative families and lines are left out. */
  topFamilies: z.array(catalogRankSchema),
  topCategories: z.array(catalogRankSchema),
})
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>
