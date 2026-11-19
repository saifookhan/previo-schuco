import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { fetchFromApiResult } from '@/lib/api/server-client'
import { QuoteBuilder } from '@/components/quote-builder'
import type { PositionFamilyVersion } from '@/components/quote-positions-nav'
import type { ProductFamilySummary } from '@/types/product-family'
import type { QuoteDetail } from '@/types/sales-quote'
import { priceValidityStatus, priceValidityToday, type FamilyVersionsResponse } from '@schuco/contracts'

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

  // New positions can only come from published families in the company's library that are ready
  // for invoicing and whose prices are valid today (the API enforces the same).
  const today = priceValidityToday()
  const families = (familiesResult.data?.families ?? []).filter(
    (f) => f.isPublished && f.inLibrary !== false && f.readyForInvoicing && priceValidityStatus(f, today) === 'current',
  )

  // For each family the positions were priced from: its version, and the newest version of it
  // that can be quoted now (the positions keep their price; the builder offers to look at the changes).
  const usableIds = new Set(families.map((f) => f.id))
  const usedFamilyIds = [...new Set(quoteResult.data.positions.map((p) => p.productFamilyId))]
  const versionResults = await Promise.all(
    usedFamilyIds.map((familyId) => fetchFromApiResult<FamilyVersionsResponse>(`/api/product-families/${familyId}/versions?graph=false`)),
  )
  const familyVersions: Record<string, PositionFamilyVersion> = {}
  usedFamilyIds.forEach((familyId, i) => {
    const result = versionResults[i]
    const own = result.status === 'ok' ? result.data.versions.find((v) => v.id === familyId) : undefined
    if (result.status !== 'ok' || !own) return
    const newer = result.data.versions.filter((v) => v.version > own.version && usableIds.has(v.id)).at(-1)
    familyVersions[familyId] = { version: own.version, newer: newer ? { id: newer.id, version: newer.version } : undefined }
  })

  return <QuoteBuilder initialDetail={quoteResult.data} families={families} familyVersions={familyVersions} />
}

export default QuoteDetailPage
