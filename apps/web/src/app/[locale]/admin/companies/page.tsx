import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchFromApiResult } from '@/lib/api/server-client'
import { CompanyCreateButton } from '@/components/company-create-button'
import { CompanyRowActions } from '@/components/company-row-actions'
import type { CompaniesListResponse } from '@schuco/contracts'

/** Super-admin platform-wide company management: create, edit, activate/deactivate. */
const AdminCompaniesPage = async () => {
  const t = await getTranslations('adminCompanies')
  const result = await fetchFromApiResult<CompaniesListResponse>('/api/admin/companies')
  const companiesList = result.data?.companies ?? []
  const loadFailed = result.status === 'error'

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('subtitle')}</p>
        </div>
        <CompanyCreateButton />
      </div>

      {loadFailed ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {t('errorLoading')}
        </div>
      ) : null}

      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-white">{t('companiesCount', { count: companiesList.length })}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-400">
                <th className="px-6 py-3 font-medium">{t('name')}</th>
                <th className="px-6 py-3 font-medium">{t('type')}</th>
                <th className="px-6 py-3 font-medium">{t('vatNumber')}</th>
                <th className="px-6 py-3 font-medium">{t('status')}</th>
                <th className="px-6 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {companiesList.map((company) => (
                <tr key={company.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-6 py-4 font-medium text-white">{company.name}</td>
                  <td className="px-6 py-4 text-slate-300 capitalize">{t(`typeValue.${company.type}`)}</td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-400">{company.vatNumber}</td>
                  <td className="px-6 py-4">
                    <Badge variant={company.isActive ? 'success' : 'muted'}>
                      {company.isActive ? t('active') : t('inactive')}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <CompanyRowActions company={company} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {companiesList.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">{t('noCompaniesFound')}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export default AdminCompaniesPage
