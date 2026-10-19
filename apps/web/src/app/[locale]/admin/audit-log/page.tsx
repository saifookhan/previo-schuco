import { getTranslations } from 'next-intl/server'

import { AuditLogViewer } from '@/components/audit-log-viewer'
import { fetchFromApiResult } from '@/lib/api/server-client'
import type { CompaniesListResponse } from '@schuco/contracts'

/** Platform-wide audit log (super-admin): every company's entries, filterable by company. */
const AdminAuditLogPage = async () => {
  const t = await getTranslations('auditLog')
  const result = await fetchFromApiResult<CompaniesListResponse>('/api/admin/companies')
  const companies = (result.data?.companies ?? []).map(({ id, name }) => ({ id, name }))

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('subtitleAdmin')}</p>
      </div>
      <AuditLogViewer tone="dark" companies={companies} />
    </div>
  )
}

export default AdminAuditLogPage
