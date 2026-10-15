import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { RolesManager } from '@/components/roles-manager'
import { fetchFromApiResult } from '@/lib/api/server-client'
import type { RolesListResponse } from '@schuco/contracts'

/** Roles (super-admin): the built-in roles plus custom ones that can be created and removed here. */
const RolesPage = async () => {
  const t = await getTranslations('settingsRoles')
  const result = await fetchFromApiResult<RolesListResponse>('/api/admin/roles')

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      {result.data ? (
        <RolesManager roles={result.data.roles} />
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {t('errorLoading')}
        </div>
      )}
    </div>
  )
}

export default RolesPage
