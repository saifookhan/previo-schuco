import { FileText, TrendingUp, Users, Wallet } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { canAccess, PAGE_ACCESS, type PageAccess } from '@/lib/auth/page-access'
import { getMe } from '@/lib/auth/require-page-access'
import { fetchFromApiResult } from '@/lib/api/server-client'
import { formatCurrency } from '@/types/quote'
import { quoteVariantCode, type QuoteSummary } from '@schuco/contracts'

/**
 * Dashboard. Quote figures come from the variant each quote marks as final.
 * Active users stays a placeholder until that count has a real source.
 */
const DashboardPage = async () => {
  const [t, locale, me] = await Promise.all([getTranslations('dashboard'), getLocale(), getMe()])
  const canViewQuotes = me.status === 'ok' && canAccess(me.data.user, { permission: 'quote.view' })
  const listed = canViewQuotes ? await fetchFromApiResult<{ quotes: QuoteSummary[] }>('/api/sales-quotes') : null
  const quotes = listed?.data?.quotes ?? []
  const finals = quotes.flatMap((quote) => {
    if (quote.archivedAt) return []
    const variant = quote.variants.find((item) => item.isFinal)
    return variant ? [{ quote, variant }] : []
  })
  const open = finals.filter((item) => item.variant.status === 'draft' || item.variant.status === 'invoiced')
  const pipeline = open.reduce((sum, item) => sum + Number(item.variant.totalPrice), 0)
  const accepted = finals.filter((item) => item.variant.status === 'accepted').length
  const conversion = finals.length === 0 ? null : Math.round((accepted / finals.length) * 100)
  const recent = [...finals].sort((a, b) => b.variant.updatedAt.localeCompare(a.variant.updatedAt)).slice(0, 5)

  const stats = [
    { label: t('openQuotes'), value: String(open.length), icon: FileText, change: t('finalOpen') },
    {
      label: t('totalPipeline'),
      value: formatCurrency(pipeline, locale),
      icon: Wallet,
      change: t('ivaExcluded'),
    },
    { label: t('activeUsers'), value: '4', icon: Users, change: t('oneInactive') },
    { label: t('conversionRate'), value: conversion === null ? '—' : `${conversion}%`, icon: TrendingUp, change: t('finalAccepted') },
  ]

  const quickActions = (
    [
      { label: t('createNewQuote'), href: '/app/quotes', access: { permission: 'quote.edit' } },
      { label: t('manageUsers'), href: '/app/settings/users', access: PAGE_ACCESS['/app/settings/users'] },
      { label: t('companySettings'), href: '/app/settings/company', access: PAGE_ACCESS['/app/settings/company'] },
    ] satisfies Array<{ label: string; href: string; access: PageAccess }>
  ).filter(({ access }) => me.status === 'ok' && canAccess(me.data.user, access))

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, change }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
                  <p className="mt-1 text-xs text-slate-400">{change}</p>
                </div>
                <div className="rounded-lg bg-brand/10 p-2">
                  <Icon className="h-5 w-5 text-brand" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('recentQuotes')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length === 0 ? <p className="text-sm text-slate-400">{t('noFinalQuotes')}</p> : null}
            {recent.map(({ quote, variant }) => (
              <Link
                key={variant.id}
                href={`/app/quotes/${quote.id}?version=${variant.version}&alternative=${variant.alternative}`}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3 hover:border-brand/30"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {quote.reference} · {quoteVariantCode(variant.version, variant.alternative)}
                  </p>
                  <p className="text-sm text-slate-500">{quote.customerName}</p>
                </div>
                <p className="font-mono text-sm font-semibold text-brand">{formatCurrency(Number(variant.totalPrice), locale)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>

        {quickActions.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('quickActions')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {quickActions.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="block rounded-lg border border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
                >
                  {label}
                </Link>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

export default DashboardPage
