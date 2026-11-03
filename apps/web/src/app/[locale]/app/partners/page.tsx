import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { NotificationsPanel } from '@/components/notifications'
import { PartnersBrowser } from '@/components/partners-browser'
import { LoadingRegion, LoadingRegionProvider } from '@/components/ui/loading-region'
import { PendingLink } from '@/components/ui/pending-link'
import { fetchFromApiResult } from '@/lib/api/server-client'
import { cn } from '@/lib/utils'
import type { PartnersResponse } from '@schuco/contracts'

/**
 * Partners: the companies mine can connect with — clients (who can receive my
 * families) and suppliers (who can share theirs with me) — and the requests
 * between us. Only connected companies can share product families.
 */
const PartnersPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const params = await searchParams
  const t = await getTranslations('partners')
  const result = await fetchFromApiResult<PartnersResponse>('/api/partners')
  const data = result.data ?? { tabs: { clients: false, suppliers: false }, companies: [] }
  const loadFailed = result.status === 'error'

  // A company that no longer fits either side (its kind changed) still comes with its connection or request,
  // so it can be removed: list it under the first tab.
  const orphans = data.companies.filter((c) => !c.isClient && !c.isSupplier)
  const orphanTab = data.tabs.clients || !data.tabs.suppliers ? 'clients' : 'suppliers'
  const tabs = [
    { key: 'clients' as const, label: t('tabClients'), list: data.companies.filter((c) => c.isClient) },
    { key: 'suppliers' as const, label: t('tabSuppliers'), list: data.companies.filter((c) => c.isSupplier) },
  ]
    .map((tab) => (tab.key === orphanTab ? { ...tab, list: [...tab.list, ...orphans] } : tab))
    .filter((tab) => data.tabs[tab.key] || tab.list.length > 0)
  const activeTab = tabs.find((tab) => tab.key === params.tab) ?? tabs[0]

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      {loadFailed ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {t('errorLoading')}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <LoadingRegionProvider>
          <div className="min-w-0">
            {tabs.length > 1 ? (
              <div className="mb-4 flex gap-1 border-b border-slate-200" role="tablist">
                {tabs.map((item) => (
                  <PendingLink
                    key={item.key}
                    href={`/app/partners?tab=${item.key}`}
                    replace
                    role="tab"
                    aria-selected={activeTab?.key === item.key}
                    className={cn(
                      '-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                      activeTab?.key === item.key ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {item.label}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{item.list.length}</span>
                  </PendingLink>
                ))}
              </div>
            ) : activeTab ? (
              <h2 className="mb-4 border-b border-slate-200 pb-2 text-sm font-medium text-brand">{activeTab.label}</h2>
            ) : null}
            <LoadingRegion>
              {activeTab ? (
                // Remount per tab so the search starts empty.
                <PartnersBrowser key={activeTab.key} companies={activeTab.list} tab={activeTab.key} />
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
                  {t('empty')}
                </p>
              )}
            </LoadingRegion>
          </div>
        </LoadingRegionProvider>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <NotificationsPanel />
        </aside>
      </div>
    </div>
  )
}

export default PartnersPage
