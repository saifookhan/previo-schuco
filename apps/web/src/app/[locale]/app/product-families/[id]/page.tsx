import { Grid3x3 } from 'lucide-react'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchFromApi } from '@/lib/api/server-client'
import { ProductFamilyRowActions } from '@/components/product-family-row-actions'
import type { ProductFamilyDetail } from '@/types/product-family'

interface ProductFamilyDetailPageProps {
  params: Promise<{ id: string }>
}

/** Full detail view for one product family: header, images, product lines, and characteristics. */
const ProductFamilyDetailPage = async ({ params }: ProductFamilyDetailPageProps) => {
  const { id } = await params
  const detail = await fetchFromApi<ProductFamilyDetail>(`/api/product-families/${id}`)
  if (!detail) {
    notFound()
  }

  const { family, images, lines, characteristics, relations } = detail
  const mainCharacteristics = characteristics.filter((c) => !c.parentId)
  const subCharacteristicsByParent = new Map<string, typeof characteristics>()
  for (const c of characteristics) {
    if (c.parentId) {
      subCharacteristicsByParent.set(c.parentId, [...(subCharacteristicsByParent.get(c.parentId) ?? []), c])
    }
  }
  const characteristicNamesByLineId = new Map<string, string[]>()
  for (const rel of relations) {
    const name = mainCharacteristics.find((c) => c.id === rel.characteristicId)?.name
    if (name) {
      characteristicNamesByLineId.set(rel.productLineId, [
        ...(characteristicNamesByLineId.get(rel.productLineId) ?? []),
        name,
      ])
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{family.name}</h1>
            <Badge variant={family.isPublished ? 'success' : 'muted'}>
              {family.isPublished ? 'Published' : 'Draft'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {[family.technicalName, family.category, family.brand].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <ProductFamilyRowActions familyId={family.id} isPublished={family.isPublished} />
      </div>

      {(family.description1 || family.description2) && (
        <Card className="mb-6">
          <CardContent className="space-y-1 pt-6 text-sm text-slate-600">
            {family.description1 ? <p>{family.description1}</p> : null}
            {family.description2 ? <p>{family.description2}</p> : null}
          </CardContent>
        </Card>
      )}

      {images.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-3">
          {images.map((image) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={image.id}
              src={`/api/product-families/${family.id}/images/${image.id}`}
              alt={image.title ?? family.name}
              className="h-32 w-32 rounded-lg border border-slate-200 object-cover"
            />
          ))}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{lines.length} product lines</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Pricing</th>
                <th className="px-6 py-3 font-medium">Unit</th>
                <th className="px-6 py-3 font-medium">Discount / Markup</th>
                <th className="px-6 py-3 font-medium">Characteristics</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-slate-50 align-top hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {line.name}
                    {line.description ? (
                      <p className="mt-0.5 text-xs font-normal text-slate-400">{line.description}</p>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {line.pricingMatrixId ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Grid3x3 className="h-3.5 w-3.5" /> Pricing matrix (BxH)
                      </span>
                    ) : (
                      <span className="font-mono text-xs">
                        {line.formula} <span className="text-slate-400">(valore = {line.value})</span>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{line.unitName || line.unitSymbol || '—'}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {Number(line.discountPct)}% / {Number(line.markupPct)}%
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {(characteristicNamesByLineId.get(line.id) ?? []).map((name) => (
                      <Badge key={name} variant="muted" className="mr-1 mb-1">
                        {name}
                      </Badge>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{mainCharacteristics.length} characteristics</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-slate-50 p-0">
          {mainCharacteristics.map((main) => (
            <div key={main.id} className="px-6 py-4">
              <p className="font-medium text-slate-900">{main.name}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(subCharacteristicsByParent.get(main.id) ?? []).map((sub) => (
                  <span
                    key={sub.id}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"
                    title={sub.pricingMatrixId ? 'Pricing matrix (BxH)' : `${sub.formula} (valore = ${sub.value})`}
                  >
                    {sub.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export default ProductFamilyDetailPage
