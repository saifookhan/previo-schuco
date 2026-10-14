import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { RolePermissionsMatrix } from '@/components/role-permissions-matrix'
import { fetchFromApiResult } from '@/lib/api/server-client'
import type { RolePermissionsResponse } from '@schuco/contracts'

/** Global role × permission matrix (super-admin): which role may do what, before company capabilities filter it. */
const AccessRightsPage = async () => {
  const t = await getTranslations('settingsAccessRights')
  const result = await fetchFromApiResult<RolePermissionsResponse>('/api/admin/role-permissions')

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      {result.data ? (
        <RolePermissionsMatrix initial={result.data} />
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {t('errorLoading')}
        </div>
      )}
    </div>
  )
}

export default AccessRightsPage
