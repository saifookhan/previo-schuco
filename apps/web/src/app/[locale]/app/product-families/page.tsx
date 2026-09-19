import { Package } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { fetchFromApi } from '@/lib/api/server-client'
import { ProductFamilyImportButton } from '@/components/product-family-import-button'
import { ProductFamilyRowActions } from '@/components/product-family-row-actions'
import type { ProductFamilySummary } from '@/types/product-family'

/**
 * Supplier product-family catalog: import from Excel, publish to clients, duplicate.
 */
const ProductFamiliesPage = async () => {
  const data = await fetchFromApi<{ families: ProductFamilySummary[] }>('/api/product-families')
  const families = data?.families ?? []

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Product families</h1>
          <p className="mt-1 text-sm text-slate-500">
            Import a supplier catalog from Excel, then publish it for clients to quote from
          </p>
        </div>
        <ProductFamilyImportButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{families.length} families</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {families.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-slate-400">
              <Package className="h-8 w-8" />
              <p className="text-sm">No product families yet — import an Excel workbook to get started.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Category</th>
                  <th className="px-6 py-3 font-medium">Brand</th>
                  <th className="px-6 py-3 font-medium">Status</th>
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
                        {family.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <ProductFamilyRowActions familyId={family.id} isPublished={family.isPublished} />
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
