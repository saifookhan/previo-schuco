import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { QuoteEditor } from '@/components/quote-editor/quote-editor'
import { fetchFromApiResult } from '@/lib/api/server-client'
import type { ProductFamilySummary } from '@/types/product-family'
import {
  priceValidityStatus,
  priceValidityToday,
  type CompanyProfileResponse,
  type SalesQuoteDetailResponse,
  type TextTemplate,
} from '@schuco/contracts'

interface QuoteDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ version?: string }>
}

/** The quote builder for one version of the quote (`?version=N`, the latest by default). */
const QuoteDetailPage = async ({ params, searchParams }: QuoteDetailPageProps) => {
  const { id } = await params
  const { version } = await searchParams
  const t = await getTranslations('quotes')
  const versionQuery = version && /^\d+$/.test(version) ? `?version=${version}` : ''
  const [quoteResult, familiesResult, profileResult, templatesResult] = await Promise.all([
    fetchFromApiResult<SalesQuoteDetailResponse>(`/api/sales-quotes/${id}${versionQuery}`),
    fetchFromApiResult<{ families: ProductFamilySummary[] }>('/api/product-families'),
    // Branch names and sales contacts only: the editor shows no logos.
    fetchFromApiResult<CompanyProfileResponse>('/api/company/profile?logos=false'),
    fetchFromApiResult<{ templates: TextTemplate[] }>('/api/company/text-templates'),
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

  // New families can only come from published ones in the company's library that are ready for
  // invoicing and whose prices are valid today (the API enforces the same on save).
  const today = priceValidityToday()
  const families = (familiesResult.data?.families ?? []).filter(
    (f) => f.isPublished && f.inLibrary !== false && f.readyForInvoicing && priceValidityStatus(f, today) === 'current',
  )

  return (
    <QuoteEditor
      key={quoteResult.data.version.id}
      initialDetail={quoteResult.data}
      families={families}
      profile={profileResult.data}
      initialTemplates={templatesResult.data?.templates ?? []}
    />
  )
}

export default QuoteDetailPage
