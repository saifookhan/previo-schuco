import { AlertTriangle, History, Package } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { fetchFromApiResult } from '@/lib/api/server-client'
import { ProductFamilyImportButton } from '@/components/product-family-import-button'
import { ProductFamilyRowActions } from '@/components/product-family-row-actions'
import type { ProductFamilySummary } from '@/types/product-family'

/**
 * Supplier product-family catalog: import from Excel, publish to clients, duplicate.
 */
const ProductFamiliesPage = async () => {
  const t = await getTranslations('productFamilies')
  const tVersion = await getTranslations('productFamilyVersion')
  const result = await fetchFromApiResult<{ families: ProductFamilySummary[] }>('/api/product-families')
  const families = result.data?.families ?? []
  const loadFailed = result.status === 'error'

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <ProductFamilyImportButton />
      </div>

      {loadFailed ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {t('errorLoading')}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('familiesCount', { count: families.length })}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {families.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-slate-400">
              <Package className="h-8 w-8" />
              <p className="text-sm">{t('emptyState')}</p>
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-6 py-3 font-medium">{t('name')}</th>
                  <th className="px-6 py-3 font-medium">{t('category')}</th>
                  <th className="px-6 py-3 font-medium">{t('brand')}</th>
                  <th className="px-6 py-3 font-medium">{t('status')}</th>
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
                    <td className="px-6 py-4 text-slate-600">{family.category ?? '—'}</td>
                    <td className="px-6 py-4 text-slate-600">{family.brand ?? '—'}</td>
                    <td className="px-6 py-4">
                      <Badge variant={family.isPublished ? 'success' : 'muted'}>
                        {family.isPublished ? t('published') : t('draft')}
                      </Badge>
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
                      <ProductFamilyRowActions
                        familyId={family.id}
                        familyName={family.name}
                        isPublished={family.isPublished}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ProductFamiliesPage
