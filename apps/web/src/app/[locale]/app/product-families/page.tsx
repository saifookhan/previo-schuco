import { AlertTriangle, History, Package } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingRegion, LoadingRegionProvider } from '@/components/ui/loading-region'
import { PendingLink } from '@/components/ui/pending-link'
import { Link } from '@/i18n/navigation'
import { fetchFromApi, fetchFromApiResult } from '@/lib/api/server-client'
import { cn } from '@/lib/utils'
import { ProductFamilyFiltersBar } from '@/components/product-family-filters'
import { PriceValidityCell } from '@/components/product-family-price-validity'
import { ProductFamilyRowActions } from '@/components/product-family-row-actions'
import { ProductFamilyShareButton } from '@/components/product-family-share-button'
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
  const t = await getTranslations('productFamilies')
  const tVersion = await getTranslations('productFamilyVersion')
  const [result, me] = await Promise.all([
    fetchFromApiResult<{ families: ProductFamilySummary[] }>('/api/product-families'),
    fetchFromApi<MeResponse>('/api/me'),
  ])
  const myCompanyId = me?.user?.company.id
  // Without knowing the caller's company the own/shared split would be wrong, so treat it as a failed load.
  const allFamilies = myCompanyId ? (result.data?.families ?? []) : []
  const ownFamilies = allFamilies.filter((f) => f.supplierCompanyId === myCompanyId)
  const sharedFamilies = allFamilies.filter((f) => f.supplierCompanyId !== myCompanyId)
  const activeTab = tab === 'shared' ? 'shared' : 'own'
  const today = priceValidityToday()
  const tabFamilies = activeTab === 'shared' ? sharedFamilies : ownFamilies
  const filters = parseProductFamilyFilters(params, activeTab)
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
        <ProductFamilyUploadButton />
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

        {tabFamilies.length > 0 ? (
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
        ) : null}

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
                <table className="w-full min-w-[880px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-500">
                      <th className="px-6 py-3 font-medium">{t('name')}</th>
                      {activeTab === 'shared' ? <th className="px-6 py-3 font-medium">{t('owner')}</th> : null}
                      <th className="px-6 py-3 font-medium">{t('category')}</th>
                      <th className="px-6 py-3 font-medium">{t('brand')}</th>
                      {activeTab === 'shared' ? <th className="px-6 py-3 font-medium">{t('yourDiscount')}</th> : null}
                      <th className="px-6 py-3 font-medium">{t('status')}</th>
                      <th className="px-6 py-3 font-medium">{t('priceValidity')}</th>
                      <th className="px-6 py-3 font-medium">{t('version')}</th>
                      <th className="px-6 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {families.map((family) => (
                      <tr key={family.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          <Link href={`/app/product-families/${family.id}`} className="hover:text-brand">
                            {family.name}
                          </Link>
                          {family.technicalName ? (
                            <span className="ml-2 text-xs text-slate-400">{family.technicalName}</span>
                          ) : null}
                        </td>
                        {activeTab === 'shared' ? (
                          <td className="px-6 py-4 text-slate-600">{family.ownerCompanyName ?? '—'}</td>
                        ) : null}
                        <td className="px-6 py-4 text-slate-600">{family.category ?? '—'}</td>
                        <td className="px-6 py-4 text-slate-600">{family.brand ?? '—'}</td>
                        {activeTab === 'shared' ? (
                          <td className="px-6 py-4 text-slate-600">
                            {family.shareDiscountPct ? `${family.shareDiscountPct}%` : '—'}
                          </td>
                        ) : null}
                        <td className="px-6 py-4">
                          <Badge variant={family.isPublished ? 'success' : 'muted'}>
                            {family.isPublished ? t('published') : t('draft')}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <PriceValidityCell validity={family} today={today} />
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="muted">{tVersion('versionBadge', { version: family.version })}</Badge>
                          {family.supersedesId ? (
                            <Link
                              href={`/app/product-families/${family.supersedesId}`}
                              className="mt-1 flex items-center gap-1 text-xs text-slate-400 hover:text-brand"
                              title={tVersion('viewPreviousVersion')}
                            >
                              <History className="h-3 w-3" />
                              {tVersion('viewPreviousVersion')}
                            </Link>
                          ) : null}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <ProductFamilyShareButton
                              familyId={family.id}
                              familyName={family.name}
                              isPublished={family.isPublished}
                            />
                            {activeTab === 'own' ? (
                              <ProductFamilyRowActions
                                familyId={family.id}
                                familyName={family.name}
                                isPublished={family.isPublished}
                                validity={family}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </LoadingRegion>
        </Card>
      </LoadingRegionProvider>
    </div>
  )
}

export default ProductFamiliesPage
