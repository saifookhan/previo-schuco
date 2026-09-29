import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { fetchFromApiResult } from '@/lib/api/server-client'
import { QuoteBuilder } from '@/components/quote-builder'
import type { ProductFamilySummary } from '@/types/product-family'
import type { QuoteDetail } from '@/types/sales-quote'

interface QuoteDetailPageProps {
  params: Promise<{ id: string }>
}

/** Quote builder: header summary, add positions from the product-family catalog, live position list, PDF export. */
const QuoteDetailPage = async ({ params }: QuoteDetailPageProps) => {
  const { id } = await params
  const t = await getTranslations('quotes')
  const [quoteResult, familiesResult] = await Promise.all([
    fetchFromApiResult<QuoteDetail>(`/api/sales-quotes/${id}`),
    fetchFromApiResult<{ families: ProductFamilySummary[] }>('/api/product-families'),
  ])

  if (quoteResult.status !== 'ok') {
    if (quoteResult.status === 'not_found') {
      notFound()
    }
    return (
      <div className="p-6 md:p-8">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {t('errorLoading')}
        </div>
      </div>
    )
  }

  const families = (familiesResult.data?.families ?? []).filter((f) => f.isPublished)

  return <QuoteBuilder initialDetail={quoteResult.data} families={families} />
}

export default QuoteDetailPage
