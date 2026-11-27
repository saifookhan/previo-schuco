import { AlertTriangle, Package } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingRegion, LoadingRegionProvider } from '@/components/ui/loading-region'
import { PendingLink } from '@/components/ui/pending-link'
import { fetchFromApi, fetchFromApiResult } from '@/lib/api/server-client'
import { cn } from '@/lib/utils'
import { ProductFamilyFiltersBar } from '@/components/product-family-filters'
import { ProductFamilyTable } from '@/components/product-family-table'
import { ProductFamilyCreateButton } from '@/components/product-family-create-button'
import { ProductFamilyUploadButton } from '@/components/product-family-upload-button'
import type { ProductFamilySummary } from '@/types/product-family'
import {
  activeProductFamilyFilterCount,
  distinctProductFamilyValues,
  filterProductFamilies,
  parseProductFamilyFilters,
  priceValidityToday,
  type MeResponse,
} from '@schuco/contracts'

/**
 * Product families, split into the company's own and the ones shared with it:
 * import from Excel, publish, duplicate, and share with other companies. The filters and
 * sort come from the URL (see `ProductFamilyFiltersBar`) and apply to the current tab.
 */
const ProductFamiliesPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const params = await searchParams
  const tab = params.tab
  const activeTab = tab === 'shared' ? 'shared' : 'own'
  const filters = parseProductFamilyFilters(params, activeTab)
  const t = await getTranslations('productFamilies')
  const [result, me] = await Promise.all([
    fetchFromApiResult<{ families: ProductFamilySummary[] }>(
      filters.archived ? '/api/product-families?includeArchived=1' : '/api/product-families',
    ),
    fetchFromApi<MeResponse>('/api/me'),
  ])
  const myCompanyId = me?.user?.company.id
  // Without knowing the caller's company the own/shared split would be wrong, so treat it as a failed load.
  const allFamilies = myCompanyId ? (result.data?.families ?? []) : []
  const ownFamilies = allFamilies.filter((f) => f.supplierCompanyId === myCompanyId)
  const sharedFamilies = allFamilies.filter((f) => f.supplierCompanyId !== myCompanyId)
  const today = priceValidityToday()
  const tabFamilies = activeTab === 'shared' ? sharedFamilies : ownFamilies
  const families = filterProductFamilies(tabFamilies, filters, today)
  const filtered = activeProductFamilyFilterCount(filters) > 0
  const loadFailed = result.status === 'error' || !myCompanyId
  const tabs = [
    { key: 'own', label: t('tabOwn'), count: ownFamilies.length, href: '/app/product-families' },
    { key: 'shared', label: t('tabShared'), count: sharedFamilies.length, href: '/app/product-families?tab=shared' },
  ] as const

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ProductFamilyCreateButton />
          <ProductFamilyUploadButton />
        </div>
      </div>

      {loadFailed ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {t('errorLoading')}
        </div>
      ) : null}

      <LoadingRegionProvider>
        <div className="mb-4 flex gap-1 border-b border-slate-200" role="tablist">
          {tabs.map((item) => (
            <PendingLink
              key={item.key}
              href={item.href}
              role="tab"
              aria-selected={activeTab === item.key}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                activeTab === item.key
                  ? 'border-brand text-brand'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              {item.label}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{item.count}</span>
            </PendingLink>
          ))}
        </div>

        <ProductFamilyFiltersBar
          // Remount per tab so "More filters" and the search box start from that tab's URL.
          key={activeTab}
          filters={filters}
          tab={activeTab}
          categories={distinctProductFamilyValues(tabFamilies, 'category')}
          brands={distinctProductFamilyValues(tabFamilies, 'brand')}
          owners={activeTab === 'shared' ? distinctProductFamilyValues(tabFamilies, 'ownerCompanyName') : []}
          shown={families.length}
          total={tabFamilies.length}
        />

        <Card>
          <LoadingRegion>
            <CardHeader>
              <CardTitle>{t('familiesCount', { count: families.length })}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {families.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-slate-400">
                  <Package className="h-8 w-8" />
                  <p className="text-sm">
                    {filtered && tabFamilies.length > 0 ? t('noMatches') : activeTab === 'shared' ? t('emptyShared') : t('emptyState')}
                  </p>
                  {filtered && tabFamilies.length > 0 ? (
                    <PendingLink
                      href={activeTab === 'shared' ? '/app/product-families?tab=shared' : '/app/product-families'}
                      className="text-sm font-medium text-brand hover:underline"
                    >
                      {t('clearFilters')}
                    </PendingLink>
                  ) : null}
                </div>
              ) : (
                <ProductFamilyTable families={families} tab={activeTab} today={today} />
              )}
            </CardContent>
          </LoadingRegion>
        </Card>
      </LoadingRegionProvider>
    </div>
  )
}

export default ProductFamiliesPage
