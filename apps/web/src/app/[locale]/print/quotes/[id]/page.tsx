import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { QuotePrintView } from '@/components/quote-print/quote-print-view'
import { fetchFromApiResult } from '@/lib/api/server-client'
import type { CompanyProfileResponse, QuotePrintData } from '@schuco/contracts'

interface QuotePrintPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ version?: string; alternative?: string; unsaved?: string }>
}

const versionQueryOf = (version: string | undefined, alternative: string | undefined) => {
  const query = new URLSearchParams()
  if (version && /^\d+$/.test(version)) query.set('version', version)
  if (alternative && /^\d+$/.test(alternative)) query.set('alternative', alternative)
  const text = query.toString()
  return text ? `?${text}` : ''
}

/** Fetched once per request for both the page and its title. */
const loadPrintData = cache((id: string, versionQuery: string) => fetchFromApiResult<QuotePrintData>(`/api/sales-quotes/${id}/print${versionQuery}`))

/** "Anteprima Preventivo": one version of the quote on A4 pages, printed or saved as PDF by the browser. */
const QuotePrintPage = async ({ params, searchParams }: QuotePrintPageProps) => {
  const { id } = await params
  const { version, alternative, unsaved } = await searchParams
  const t = await getTranslations('quotePrint')
  const [printResult, profileResult] = await Promise.all([
    loadPrintData(id, versionQueryOf(version, alternative)),
    unsaved === '1' ? fetchFromApiResult<CompanyProfileResponse>('/api/company/profile') : Promise.resolve(null),
  ])

  if (printResult.status !== 'ok') {
    if (printResult.status === 'not_found') {
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

  return (
    <QuotePrintView
      data={printResult.data}
      businessUnits={profileResult?.data?.businessUnits ?? []}
      salesContacts={profileResult?.data?.salesContacts ?? []}
      unsaved={unsaved === '1'}
    />
  )
}

/** The title is the file name the browser suggests when saving as PDF. */
export const generateMetadata = async ({ params, searchParams }: QuotePrintPageProps) => {
  const [{ id }, { version, alternative }] = await Promise.all([params, searchParams])
  const result = await loadPrintData(id, versionQueryOf(version, alternative))
  const code = result.data ? `V${result.data.version.version}A${result.data.version.alternative}` : ''
  return { title: result.data ? `${result.data.quote.reference} ${code} — ${result.data.version.document.header.customerName}` : undefined }
}

export default QuotePrintPage
