import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { CatalogLinksManager } from '@/components/catalog-links-manager'
import { fetchFromApiResult } from '@/lib/api/server-client'
import type { CatalogLinksListResponse, CompaniesListResponse } from '@schuco/contracts'

/** Super-admin: which manufacturer catalogs are shared with which suppliers and clients. */
const AdminLinksPage = async () => {
  const t = await getTranslations('adminLinks')
  const [linksResult, companiesResult] = await Promise.all([
    fetchFromApiResult<CatalogLinksListResponse>('/api/admin/links'),
    fetchFromApiResult<CompaniesListResponse>('/api/admin/companies'),
  ])
  const loadFailed = linksResult.status === 'error' || companiesResult.status === 'error'

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('subtitle')}</p>
      </div>

      {loadFailed ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {t('errorLoading')}
        </div>
      ) : null}

      {loadFailed ? null : (
        <CatalogLinksManager
          links={linksResult.data?.links ?? []}
          companies={(companiesResult.data?.companies ?? []).filter((c) => c.isActive)}
        />
      )}
    </div>
  )
}

export default AdminLinksPage
