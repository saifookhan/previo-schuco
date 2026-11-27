import { AlertTriangle, FileText } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { QuoteChat } from '@/components/quote-chat/quote-chat'
import { QuoteFiltersBar } from '@/components/quote-filters'
import { QuoteNewButton } from '@/components/quote-new-button'
import { QuotesTable } from '@/components/quotes-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingRegion, LoadingRegionProvider } from '@/components/ui/loading-region'
import { fetchFromApiResult } from '@/lib/api/server-client'
import { parseQuoteListFilters, quoteListFiltersToApiQuery, type QuoteSummary } from '@schuco/contracts'

/** Supplier's own quotes. Filters, including archived, come from the URL. */
const QuotesPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const params = await searchParams
  const filters = parseQuoteListFilters(params)
  const t = await getTranslations('quotes')
  const result = await fetchFromApiResult<{ quotes: QuoteSummary[] }>(`/api/sales-quotes${quoteListFiltersToApiQuery(filters)}`)
  const quotes = result.data?.quotes ?? []
  const loadFailed = result.status === 'error'
  const filtered = filters.q !== '' || filters.status !== '' || filters.archived

  return (
    <div className="p-6 md:p-8">
      <LoadingRegionProvider>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
          </div>
          <QuoteNewButton />
        </div>

        {loadFailed ? (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {t('errorLoading')}
          </div>
        ) : null}

        <QuoteFiltersBar filters={filters} />

        <LoadingRegion>
          <Card>
            <CardHeader>
              <CardTitle>{t('quotesCount', { count: quotes.length })}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {quotes.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-slate-400">
                  <FileText className="h-8 w-8" />
                  <p className="text-sm">{filtered ? t('noMatches') : t('emptyState')}</p>
                </div>
              ) : (
                <QuotesTable quotes={quotes} />
              )}
            </CardContent>
          </Card>
        </LoadingRegion>
      </LoadingRegionProvider>
      <QuoteChat />
    </div>
  )
}

export default QuotesPage
