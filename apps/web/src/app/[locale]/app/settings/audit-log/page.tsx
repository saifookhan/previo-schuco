import { getTranslations } from 'next-intl/server'

import { AuditLogViewer } from '@/components/audit-log-viewer'

/** The company's own audit log (company admin): who changed what in this company, and when. */
const SettingsAuditLogPage = async () => {
  const t = await getTranslations('auditLog')

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>
      <AuditLogViewer tone="light" />
    </div>
  )
}

export default SettingsAuditLogPage
