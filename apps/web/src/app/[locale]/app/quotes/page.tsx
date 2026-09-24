import { AlertTriangle, FileText } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { fetchFromApiResult } from '@/lib/api/server-client'
import { QuoteNewButton } from '@/components/quote-new-button'
import type { QuoteSummary } from '@/types/sales-quote'

const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

const statusVariant = (status: QuoteSummary['status']): 'success' | 'muted' | 'warning' => {
  if (status === 'accepted') return 'success'
  if (status === 'sent' || status === 'rejected') return 'warning'
  return 'muted'
}

/** Supplier's own quotes: create a new one, or open an existing draft to keep building it. */
const QuotesPage = async () => {
  const t = await getTranslations('quotes')
  const result = await fetchFromApiResult<{ quotes: QuoteSummary[] }>('/api/sales-quotes')
  const quotes = result.data?.quotes ?? []
  const loadFailed = result.status === 'error'

  return (
    <div className="p-6 md:p-8">
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

      <Card>
        <CardHeader>
          <CardTitle>{t('quotesCount', { count: quotes.length })}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {quotes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-slate-400">
              <FileText className="h-8 w-8" />
              <p className="text-sm">{t('emptyState')}</p>
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-6 py-3 font-medium">{t('reference')}</th>
                  <th className="px-6 py-3 font-medium">{t('customer')}</th>
                  <th className="px-6 py-3 font-medium">{t('status')}</th>
                  <th className="px-6 py-3 font-medium">{t('total')}</th>
                  <th className="px-6 py-3 font-medium">{t('created')}</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      <Link href={`/app/quotes/${quote.id}`} className="hover:text-brand">
                        {quote.reference}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{quote.customerName}</td>
                    <td className="px-6 py-4">
                      <Badge variant={statusVariant(quote.status)}>{t(`statusValue.${quote.status}`)}</Badge>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{EUR.format(Number(quote.totalPrice))}</td>
                    <td className="px-6 py-4 text-slate-500">
                      {new Date(quote.createdAt).toLocaleDateString('it-IT')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default QuotesPage
