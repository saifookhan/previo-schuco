import { AlertTriangle, FileText, Timer, TrendingUp, Wallet } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'

import { QuotesOverTimeChart } from '@/components/dashboard/quotes-over-time-chart'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { fetchFromApiResult } from '@/lib/api/server-client'
import { canAccess, PAGE_ACCESS, type PageAccess } from '@/lib/auth/page-access'
import { getMe } from '@/lib/auth/require-page-access'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/types/quote'
import type { DashboardQuoteRef, DashboardResponse, QuoteStatus } from '@schuco/contracts'

const PERIODS = ['week', 'month', 'year'] as const
type Period = (typeof PERIODS)[number]

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value)

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

const dayBefore = (ymd: string): string => {
  const [year, month, day] = ymd.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! - 1)).toISOString().slice(0, 10)
}

const formatDay = (ymd: string, locale: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

const formatWhen = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome' })

const formatRate = (rate: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(rate)

const formatNumber = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)

const money = (total: string, locale: string) => formatCurrency(Number(total), locale)

/** V2A3 — version x, alternative y. */
const variantCode = (quote: DashboardQuoteRef) => `V${quote.latestVersion}A${quote.alternative}`

const statusVariant = (status: QuoteStatus): 'success' | 'muted' | 'warning' => {
  if (status === 'accepted') return 'success'
  if (status === 'invoiced') return 'warning'
  return 'muted'
}

const STATUSES = ['draft', 'invoiced', 'accepted'] as const

const hasChartData = (data: DashboardResponse) =>
  data.overTime.points.some((point) => STATUSES.some((status) => point.byStatus[status].count > 0))

/**
 * Company sales dashboard. Figures come from GET /api/dashboard.
 * Quick actions stay permission-filtered.
 */
const DashboardPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const params = await searchParams
  const periodRaw = first(params.period)
  const period: Period = periodRaw === 'month' || periodRaw === 'year' ? periodRaw : 'week'
  const includeTest = first(params.includeTest) === '1'
  const salespersonRaw = first(params.salespersonId)
  const salespersonId = salespersonRaw && isUuid(salespersonRaw) ? salespersonRaw : null

  const query = new URLSearchParams()
  if (period !== 'week') query.set('period', period)
  if (includeTest) query.set('includeTest', '1')
  if (salespersonId) query.set('salespersonId', salespersonId)
  const qs = query.toString()

  const [t, tStatus, locale, me, result] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('quotes.statusValue'),
    getLocale(),
    getMe(),
    fetchFromApiResult<DashboardResponse>(`/api/dashboard${qs ? `?${qs}` : ''}`),
  ])

  const data = result.data
  const loadFailed = result.status !== 'ok' || !data

  const href = (next: { period?: Period; includeTest?: boolean; salespersonId?: string | null }) => {
    const nextQuery = new URLSearchParams()
    const nextPeriod = next.period ?? period
    if (nextPeriod !== 'week') nextQuery.set('period', nextPeriod)
    if (next.includeTest ?? includeTest) nextQuery.set('includeTest', '1')
    const nextSalesperson = next.salespersonId === undefined ? salespersonId : next.salespersonId
    if (nextSalesperson) nextQuery.set('salespersonId', nextSalesperson)
    const nextQs = nextQuery.toString()
    return nextQs ? `/app/dashboard?${nextQs}` : '/app/dashboard'
  }

  const quickActions = (
    [
      { label: t('createNewQuote'), href: '/app/quotes', access: { permission: 'quote.edit' } },
      { label: t('manageUsers'), href: '/app/settings/users', access: PAGE_ACCESS['/app/settings/users'] },
      { label: t('companySettings'), href: '/app/settings/company', access: PAGE_ACCESS['/app/settings/company'] },
    ] satisfies Array<{ label: string; href: string; access: PageAccess }>
  ).filter(({ access }) => me.status === 'ok' && canAccess(me.data.user, access))

  const statusLabels = {
    draft: tStatus('draft'),
    invoiced: tStatus('invoiced'),
    accepted: tStatus('accepted'),
  } as const

  const periodLabel = { week: t('periodWeek'), month: t('periodMonth'), year: t('periodYear') } as const
  const overTimeHint = { week: t('overTimeWeek'), month: t('overTimeMonth'), year: t('overTimeYear') } as const

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
          {data ? (
            <p className="mt-1 text-xs text-slate-400">
              {t('periodRange', { start: formatDay(data.periodStart, locale), end: formatDay(dayBefore(data.periodEnd), locale) })}
              {data.scope === 'own' ? ` · ${t('ownScope')}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <div className="flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label={t('title')}>
            {PERIODS.map((key) => (
              <Link
                key={key}
                href={href({ period: key })}
                role="tab"
                aria-selected={period === key}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium',
                  period === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {periodLabel[key]}
              </Link>
            ))}
          </div>
          <Link href={href({ includeTest: !includeTest })} className="text-sm font-medium text-brand hover:underline">
            {includeTest ? t('hideTestQuotes') : t('showTestQuotes')}
          </Link>
        </div>
      </div>

      {loadFailed ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {t('errorLoading')}
        </div>
      ) : null}

      {data && data.hiddenTestQuoteCount > 0 ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('hiddenTestQuotes', { count: data.hiddenTestQuoteCount })}{' '}
          <Link href={href({ includeTest: true })} className="font-medium underline">
            {t('showTestQuotes')}
          </Link>
        </div>
      ) : null}

      {data && data.scope === 'company' && data.salespeople.length > 0 ? (
        <form className="mb-6 flex flex-wrap items-end gap-2" method="get">
          {period !== 'week' ? <input type="hidden" name="period" value={period} /> : null}
          {includeTest ? <input type="hidden" name="includeTest" value="1" /> : null}
          <label className="text-sm text-slate-600">
            <span className="mb-1 block text-xs text-slate-500">{t('salesperson')}</span>
            <select
              name="salespersonId"
              defaultValue={salespersonId ?? ''}
              className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800"
            >
              <option value="">{t('allSalespeople')}</option>
              {data.salespeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name ?? t('unknownSalesperson')}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-9 rounded-md bg-brand px-3 text-sm font-medium text-white">
            {t('applyFilter')}
          </button>
        </form>
      ) : null}

      {data ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={FileText} label={t('openQuotes')} value={String(data.kpis.openQuotes.count)} detail={t('openQuotesHint', { total: money(data.kpis.openQuotes.total, locale) })} />
            <Kpi
              icon={Wallet}
              label={t('acceptedInPeriod')}
              value={money(data.kpis.acceptedInPeriod.total, locale)}
              detail={t('acceptedHint', { count: data.kpis.acceptedInPeriod.count })}
            />
            <Kpi
              icon={TrendingUp}
              label={t('averageQuote')}
              value={data.kpis.averageQuoteValue ? money(data.kpis.averageQuoteValue, locale) : '—'}
              detail={data.kpis.averageQuoteValue ? t('averageHint', { count: data.kpis.averageQuoteSample }) : t('averageEmpty')}
            />
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500">{t('pipeline')}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {STATUSES.map((status) => (
                    <li key={status} className="flex items-center justify-between gap-3">
                      <span className="text-slate-600">{statusLabels[status]}</span>
                      <span className="font-medium text-slate-900">
                        {data.kpis.pipelineByStatus[status].count} · {money(data.kpis.pipelineByStatus[status].total, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-400">{t('ivaExcluded')}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t('funnelTitle')}</CardTitle>
              <p className="mt-1 text-sm text-slate-500">{t('funnelHint')}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {STATUSES.map((status) => {
                const row = data.funnel[status]
                const max = Math.max(...STATUSES.map((key) => data.funnel[key].count), 1)
                return (
                  <div key={status}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{statusLabels[status]}</span>
                      <span className="text-slate-500">
                        {row.count} · {money(row.total, locale)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className={cn('h-2 rounded-full', status === 'draft' && 'bg-slate-400', status === 'invoiced' && 'bg-amber-400', status === 'accepted' && 'bg-emerald-500')}
                        style={{ width: `${(row.count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              {data.funnel.invoiced.count + data.funnel.accepted.count === 0 ? (
                <p className="text-sm text-slate-500">{t('funnelEmpty')}</p>
              ) : null}
            </CardContent>
          </Card>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('recentQuotes')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentQuotes.length === 0 ? (
                  <Empty text={t('recentEmpty')} />
                ) : (
                  data.recentQuotes.map((row) => (
                    <QuoteRow
                      key={row.id}
                      quote={row}
                      locale={locale}
                      statusLabel={statusLabels[row.status]}
                      finalLabel={t('finalVariant')}
                      editedLabel={t('editedAt', { when: formatWhen(row.updatedAt, locale) })}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('needsAttention')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Attention
                  title={t('staleDrafts')}
                  hint={t('staleHint', { days: data.attention.staleAfterDays })}
                  empty={t('none')}
                  rows={data.attention.staleDrafts}
                  locale={locale}
                  moreLabel={t('moreCount', { count: Math.max(data.attention.staleDrafts.count - data.attention.staleDrafts.quotes.length, 0) })}
                />
                <Attention
                  title={t('zeroDrafts')}
                  hint={t('zeroHint')}
                  empty={t('none')}
                  rows={data.attention.zeroDrafts}
                  locale={locale}
                  moreLabel={t('moreCount', { count: Math.max(data.attention.zeroDrafts.count - data.attention.zeroDrafts.quotes.length, 0) })}
                />
                <Attention
                  title={t('editedThisWeek')}
                  hint={t('editedThisWeekHint')}
                  empty={t('none')}
                  rows={data.attention.editedThisWeek}
                  locale={locale}
                  moreLabel={t('moreCount', { count: Math.max(data.attention.editedThisWeek.count - data.attention.editedThisWeek.quotes.length, 0) })}
                />
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t('overTimeTitle')}</CardTitle>
              <p className="mt-1 text-sm text-slate-500">{overTimeHint[period]}</p>
            </CardHeader>
            <CardContent>
              {hasChartData(data) ? (
                <QuotesOverTimeChart points={data.overTime.points} bucket={data.overTime.bucket} locale={locale} statusLabels={statusLabels} />
              ) : (
                <Empty text={t('overTimeEmpty')} />
              )}
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t('priceListTitle')}</CardTitle>
              <p className="mt-1 text-sm text-slate-500">{t('priceListHint')}</p>
            </CardHeader>
            <CardContent>
              {data.priceListHealth.expired.count +
                data.priceListHealth.expiringWithin14Days.count +
                data.priceListHealth.expiringWithin30Days.count +
                data.priceListHealth.unpublished.count +
                data.priceListHealth.notReadyForInvoicing.count ===
              0 ? (
                <Empty text={t('priceListClear')} />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <HealthList title={t('expired')} list={data.priceListHealth.expired} locale={locale} empty={t('priceListEmpty')} until={(date) => t('validUntil', { date })} more={(count) => t('moreCount', { count })} />
                  <HealthList title={t('expiring14')} list={data.priceListHealth.expiringWithin14Days} locale={locale} empty={t('priceListEmpty')} until={(date) => t('validUntil', { date })} more={(count) => t('moreCount', { count })} />
                  <HealthList title={t('expiring30')} list={data.priceListHealth.expiringWithin30Days} locale={locale} empty={t('priceListEmpty')} until={(date) => t('validUntil', { date })} more={(count) => t('moreCount', { count })} />
                  <HealthList title={t('unpublished')} list={data.priceListHealth.unpublished} locale={locale} empty={t('priceListEmpty')} until={(date) => t('validUntil', { date })} more={(count) => t('moreCount', { count })} />
                  <HealthList title={t('notReady')} list={data.priceListHealth.notReadyForInvoicing} locale={locale} empty={t('priceListEmpty')} until={(date) => t('validUntil', { date })} more={(count) => t('moreCount', { count })} />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-slate-400" />
                  {t('followUpTitle')}
                </CardTitle>
                <p className="mt-1 text-sm text-slate-500">{t('followUpHint')}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.followUp.length === 0 ? (
                  <Empty text={t('followUpEmpty')} />
                ) : (
                  data.followUp.map((row) => (
                    <div key={row.quote.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-4 py-3">
                      <div>
                        <Link href={`/app/quotes/${row.quote.id}`} className="font-medium text-slate-900 hover:text-brand">
                          {row.quote.reference}{' '}
                          <span className="font-normal text-slate-400">{variantCode(row.quote)}</span>
                        </Link>
                        <p className="text-sm text-slate-500">{row.quote.customerName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-800">
                          {row.daysSinceSent === null ? t('sentDateMissing') : t('daysWaiting', { days: row.daysSinceSent })}
                        </p>
                        <p className="text-xs text-slate-400">{money(row.quote.totalPrice, locale)}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('winRateTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <Rate
                  label={t('winRateDecided')}
                  hint={t('winRateDecidedHint')}
                  value={data.winRate.acceptedOverDecided === null ? null : formatRate(data.winRate.acceptedOverDecided, locale)}
                  sample={t('sampleDecided', { accepted: data.winRate.accepted, rejected: data.winRate.rejected })}
                  empty={t('notEnoughData')}
                  emptyHint={t('winRateEmptyHint')}
                />
                <Rate
                  label={t('winRateSent')}
                  hint={t('winRateSentHint')}
                  value={data.winRate.acceptedOverSent === null ? null : formatRate(data.winRate.acceptedOverSent, locale)}
                  sample={t('sampleSent', { sent: data.winRate.sent })}
                  empty={t('notEnoughData')}
                  emptyHint={t('winRateEmptyHint')}
                />
                <Rate
                  label={t('medianDays')}
                  hint={t('medianDaysHint')}
                  value={data.winRate.medianDaysToAccept === null ? null : formatNumber(data.winRate.medianDaysToAccept, locale)}
                  sample={t('sampleMedian', { count: data.winRate.timedAcceptances })}
                  empty={t('notEnoughData')}
                  emptyHint={t('winRateEmptyHint')}
                />
              </CardContent>
            </Card>
          </div>

          {data.perSalesperson ? (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>{t('salespersonTitle')}</CardTitle>
                <p className="mt-1 text-sm text-slate-500">{t('salespersonHint')}</p>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {data.perSalesperson.length === 0 ? (
                  <div className="px-6 py-8">
                    <Empty text={t('salespersonEmpty')} />
                  </div>
                ) : (
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-slate-500">
                        <th className="px-6 py-3 font-medium">{t('colSalesperson')}</th>
                        <th className="px-6 py-3 font-medium">{t('colQuotes')}</th>
                        <th className="px-6 py-3 font-medium">{t('colTotal')}</th>
                        <th className="px-6 py-3 font-medium">{t('colAccepted')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.perSalesperson.map((row) => (
                        <tr key={row.userId ?? 'unknown'} className="border-b border-slate-50">
                          <td className="px-6 py-3 text-slate-800">{row.name ?? t('unknownSalesperson')}</td>
                          <td className="px-6 py-3 text-slate-600">{row.quotes}</td>
                          <td className="px-6 py-3 text-slate-600">{money(row.total, locale)}</td>
                          <td className="px-6 py-3 text-slate-600">{money(row.acceptedTotal, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          ) : null}

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('customersTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <RankList title={t('customersOpen')} empty={t('customersEmpty')} rows={data.topCustomers.byOpenPipeline} locale={locale} />
                <RankList title={t('customersAccepted')} empty={t('customersEmpty')} rows={data.topCustomers.byAccepted} locale={locale} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('familiesTitle')}</CardTitle>
                <p className="mt-1 text-sm text-slate-500">{t('familiesHint')}</p>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {data.topFamilies.length === 0 && data.topCategories.length === 0 ? (
                  <div className="sm:col-span-2">
                    <Empty text={t('familiesEmpty')} />
                  </div>
                ) : (
                  <>
                    <CatalogList title={t('byFamily')} rows={data.topFamilies} locale={locale} linesLabel={(count, area) => t('linesAndArea', { count, area })} />
                    <CatalogList title={t('byCategory')} rows={data.topCategories} locale={locale} linesLabel={(count, area) => t('linesAndArea', { count, area })} />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {quickActions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('quickActions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map(({ label, href: actionHref }) => (
              <Link
                key={actionHref}
                href={actionHref}
                className="block rounded-lg border border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
              >
                {label}
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

const Kpi = ({ icon: Icon, label, value, detail }: { icon: typeof FileText; label: string; value: string; detail: string }) => (
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </div>
        <div className="rounded-lg bg-brand/10 p-2">
          <Icon className="h-5 w-5 text-brand" />
        </div>
      </div>
    </CardContent>
  </Card>
)

const Empty = ({ text }: { text: string }) => <p className="text-sm text-slate-500">{text}</p>

const QuoteRow = ({
  quote,
  locale,
  statusLabel,
  finalLabel,
  editedLabel,
}: {
  quote: DashboardQuoteRef
  locale: string
  statusLabel: string
  finalLabel: string
  editedLabel: string
}) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-4 py-3">
    <div>
      <Link href={`/app/quotes/${quote.id}`} className="font-medium text-slate-900 hover:text-brand">
        {quote.reference} <span className="font-normal text-slate-400">{variantCode(quote)}</span>
      </Link>
      <p className="text-sm text-slate-500">{quote.customerName}</p>
      <p className="text-xs text-slate-400">{editedLabel}</p>
    </div>
    <div className="text-right">
      <div className="flex justify-end gap-1">
        {quote.isFinal ? <Badge>{finalLabel}</Badge> : null}
        <Badge variant={statusVariant(quote.status)}>{statusLabel}</Badge>
      </div>
      <p className="mt-1 font-mono text-sm font-semibold text-brand">{money(quote.totalPrice, locale)}</p>
    </div>
  </div>
)

const Attention = ({
  title,
  hint,
  empty,
  rows,
  locale,
  moreLabel,
}: {
  title: string
  hint: string
  empty: string
  rows: { count: number; quotes: DashboardQuoteRef[] }
  locale: string
  moreLabel: string
}) => (
  <div>
    <div className="flex items-baseline justify-between gap-2">
      <p className="text-sm font-medium text-slate-800">
        {title} <span className="text-slate-400">{rows.count}</span>
      </p>
    </div>
    <p className="text-xs text-slate-400">{hint}</p>
    {rows.quotes.length === 0 ? (
      <p className="mt-1 text-sm text-slate-500">{empty}</p>
    ) : (
      <ul className="mt-1 space-y-1">
        {rows.quotes.map((quote) => (
          <li key={quote.id} className="flex items-center justify-between gap-2 text-sm">
            <Link href={`/app/quotes/${quote.id}`} className="truncate text-slate-700 hover:text-brand">
              {quote.reference} {variantCode(quote)} · {quote.customerName}
            </Link>
            <span className="shrink-0 text-slate-500">{money(quote.totalPrice, locale)}</span>
          </li>
        ))}
      </ul>
    )}
    {rows.count > rows.quotes.length ? <p className="mt-1 text-xs text-slate-400">{moreLabel}</p> : null}
  </div>
)

const HealthList = ({
  title,
  list,
  locale,
  empty,
  until,
  more,
}: {
  title: string
  list: DashboardResponse['priceListHealth']['expired']
  locale: string
  empty: string
  until: (date: string) => string
  more: (count: number) => string
}) => (
  <div>
    <p className="text-sm font-medium text-slate-800">
      {title} <span className="text-slate-400">{list.count}</span>
    </p>
    {list.families.length === 0 ? (
      <p className="mt-1 text-sm text-slate-500">{empty}</p>
    ) : (
      <ul className="mt-1 space-y-1">
        {list.families.map((family) => (
          <li key={family.id} className="text-sm">
            <Link href={`/app/product-families/${family.id}`} className="text-slate-700 hover:text-brand">
              {family.name}
            </Link>
            {family.priceValidTo ? <span className="text-slate-400"> · {until(formatDay(family.priceValidTo, locale))}</span> : null}
          </li>
        ))}
      </ul>
    )}
    {list.count > list.families.length ? <p className="mt-1 text-xs text-slate-400">{more(list.count - list.families.length)}</p> : null}
  </div>
)

const Rate = ({
  label,
  hint,
  value,
  sample,
  empty,
  emptyHint,
}: {
  label: string
  hint: string
  value: string | null
  sample: string
  empty: string
  emptyHint: string
}) => (
  <div>
    <p className="text-sm text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-bold text-slate-900">{value ?? empty}</p>
    <p className="mt-1 text-xs text-slate-400">{value === null ? emptyHint : sample}</p>
    <p className="mt-1 text-xs text-slate-400">{hint}</p>
  </div>
)

const RankList = ({
  title,
  empty,
  rows,
  locale,
}: {
  title: string
  empty: string
  rows: DashboardResponse['topCustomers']['byOpenPipeline']
  locale: string
}) => (
  <div>
    <p className="text-sm font-medium text-slate-800">{title}</p>
    {rows.length === 0 ? (
      <p className="mt-1 text-sm text-slate-500">{empty}</p>
    ) : (
      <ul className="mt-2 space-y-1">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-slate-700">
              {row.name} <span className="text-slate-400">({row.count})</span>
            </span>
            <span className="shrink-0 text-slate-600">{money(row.total, locale)}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
)

const CatalogList = ({
  title,
  rows,
  locale,
  linesLabel,
}: {
  title: string
  rows: DashboardResponse['topFamilies']
  locale: string
  linesLabel: (count: number, area: string) => string
}) => (
  <div>
    <p className="text-sm font-medium text-slate-800">{title}</p>
    <ul className="mt-2 space-y-2">
      {rows.map((row) => (
        <li key={row.name} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-slate-700">{row.name}</span>
            <span className="shrink-0 text-slate-600">{money(row.total, locale)}</span>
          </div>
          <p className="text-xs text-slate-400">{linesLabel(row.lineCount, formatNumber(row.areaM2, locale))}</p>
        </li>
      ))}
    </ul>
  </div>
)

export default DashboardPage
