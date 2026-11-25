import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { CompanySettings } from '@/components/company-settings/company-settings'
import { fetchFromApiResult } from '@/lib/api/server-client'
import type { CompanyProfileResponse, TextTemplate } from '@schuco/contracts'

/** The company's details as its quotes print them: fiscal data, branches, sales contacts, saved texts. */
const CompanyPage = async () => {
  const t = await getTranslations('settingsCompany')
  const [profileResult, templatesResult] = await Promise.all([
    fetchFromApiResult<CompanyProfileResponse>('/api/company/profile'),
    fetchFromApiResult<{ templates: TextTemplate[] }>('/api/company/text-templates'),
  ])

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>
      {profileResult.status === 'ok' ? (
        <CompanySettings initialProfile={profileResult.data} initialTemplates={templatesResult.data?.templates ?? []} />
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {t('errorLoading')}
        </div>
      )}
    </div>
  )
}

export default CompanyPage
