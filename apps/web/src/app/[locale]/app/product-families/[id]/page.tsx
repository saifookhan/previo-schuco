import { AlertTriangle, History } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { fetchFromApiResult } from '@/lib/api/server-client'
import { ProductFamilyFlagSelect } from '@/components/product-family-flag-select'
import { ProductFamilyImageGallery } from '@/components/product-family-image-gallery'
import { ProductFamilyMatrixPreview } from '@/components/product-family-matrix-preview'
import { ProductFamilyPriceValidity } from '@/components/product-family-price-validity'
import { ProductFamilyPricingEditor } from '@/components/product-family-pricing-editor'
import { ProductFamilyRowActions } from '@/components/product-family-row-actions'
import { ProductFamilyShareButton } from '@/components/product-family-share-button'
import { ProductFamilyUploadButton } from '@/components/product-family-upload-button'
import { ProductFamilyVersions } from '@/components/product-family-versions'
import { RecordHistory } from '@/components/record-history'
import type { ProductFamilyDetail } from '@/types/product-family'
import { priceValidityToday, type FamilyVersionsResponse } from '@schuco/contracts'

interface ProductFamilyDetailPageProps {
  params: Promise<{ id: string }>
}

/** Full detail view for one product family: header, images, product lines, and characteristics. */
const ProductFamilyDetailPage = async ({ params }: ProductFamilyDetailPageProps) => {
  const { id } = await params
  const t = await getTranslations('productFamilyDetail')
  const tList = await getTranslations('productFamilies')
  const tVersion = await getTranslations('productFamilyVersion')
  const tEdit = await getTranslations('productFamilyEdit')
  const tFlags = await getTranslations('productFamilyFlags')
  const [result, versionsResult] = await Promise.all([
    fetchFromApiResult<ProductFamilyDetail>(`/api/product-families/${id}`),
    fetchFromApiResult<FamilyVersionsResponse>(`/api/product-families/${id}/versions`),
  ])

  if (result.status !== 'ok') {
    if (result.status === 'not_found') {
      notFound()
    }
    return (
      <div className="p-6 md:p-8">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {tList('errorLoading')}
        </div>
      </div>
    )
  }

  const detail = result.data
  const { family, images, lines, characteristics, matrices, relations, editable, canViewHistory, canManage } = detail
  const matrixById = new Map(matrices.map((m) => [m.id, m]))
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

  // Readable names for the ids history entries mention: lines, options ("Glass: Triple"), and price tables (named after their owner).
  const historyItemNames: Record<string, string> = {}
  for (const line of lines) {
    historyItemNames[line.id] = line.name
  }
  for (const main of mainCharacteristics) {
    historyItemNames[main.id] = main.name
    for (const sub of subCharacteristicsByParent.get(main.id) ?? []) {
      historyItemNames[sub.id] = `${main.name}: ${sub.name}`
    }
  }
  for (const item of [...lines, ...characteristics]) {
    if (item.pricingMatrixId) {
      historyItemNames[item.pricingMatrixId] = historyItemNames[item.id] ?? item.name
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{family.name}</h1>
            <Badge variant={family.isPublished ? 'success' : 'muted'}>
              {family.isPublished ? tList('published') : tList('draft')}
            </Badge>
            <Badge variant="muted">{tVersion('versionBadge', { version: family.version })}</Badge>
            {!editable ? <Badge variant="warning">{tEdit('lockedBadge')}</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {[family.technicalName, family.category, family.brand].filter(Boolean).join(' · ') || '—'}
          </p>
          <ProductFamilyPriceValidity familyId={family.id} validity={family} canEdit={canManage} today={priceValidityToday()} />
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
            {(
              [
                ['hasPriceList', family.hasPriceList, canManage],
                ['readyForInvoicing', family.readyForInvoicing, canManage],
                // The caller's own company library, also for a family shared with it (the select checks who may).
                ['inLibrary', detail.inLibrary, true],
              ] as const
            ).map(([flag, value, canEdit]) => (
              <div key={flag} className="flex items-center gap-2">
                <span>{tFlags(`${flag}.title`)}</span>
                <ProductFamilyFlagSelect flag={flag} familyId={family.id} familyName={family.name} value={value} canEdit={canEdit} />
              </div>
            ))}
          </div>
          {family.supersedesId ? (
            <Link
              href={`/app/product-families/${family.supersedesId}`}
              className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-brand"
            >
              <History className="h-3 w-3" />
              {tVersion('viewPreviousVersion')}
            </Link>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <ProductFamilyRowActions
            familyId={family.id}
            familyName={family.name}
            isPublished={family.isPublished}
            readyForInvoicing={family.readyForInvoicing}
            validity={family}
            redirectAfterDeleteHref="/app/product-families"
          />
          {canManage ? (
            <ProductFamilyUploadButton
              version={{ familyId: family.id, familyName: family.name, readyForInvoicing: family.readyForInvoicing }}
            />
          ) : null}
          <ProductFamilyShareButton familyId={family.id} familyName={family.name} isPublished={family.isPublished} />
        </div>
      </div>

      {(family.description1 || family.description2) && (
        <Card className="mb-6">
          <CardContent className="space-y-1 pt-6 text-sm text-slate-600">
            {family.description1 ? <p>{family.description1}</p> : null}
            {family.description2 ? <p>{family.description2}</p> : null}
          </CardContent>
        </Card>
      )}

      <ProductFamilyImageGallery familyId={family.id} familyName={family.name} images={images} />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('productLinesCount', { count: lines.length })}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="px-6 py-3 font-medium">{t('nameHeader')}</th>
                <th className="px-6 py-3 font-medium">{t('pricingHeader')}</th>
                <th className="px-6 py-3 font-medium">{t('unitHeader')}</th>
                <th className="px-6 py-3 font-medium">{t('discountMarkupHeader')}</th>
                <th className="px-6 py-3 font-medium">{t('characteristicsHeader')}</th>
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
                    {line.pricingMatrixId && matrixById.has(line.pricingMatrixId) ? (
                      <ProductFamilyMatrixPreview
                        familyId={family.id}
                        matrix={matrixById.get(line.pricingMatrixId)!}
                        label={t('pricingMatrix')}
                        editable={editable}
                      />
                    ) : (
                      <span className="font-mono text-xs">
                        {line.formula} <span className="text-slate-400">(valore = {line.value})</span>
                      </span>
                    )}
                    <ProductFamilyPricingEditor
                      kind="line"
                      familyId={family.id}
                      itemId={line.id}
                      itemName={line.name}
                      editable={editable}
                      initial={{
                        value: line.value,
                        formula: line.formula,
                        discountPct: line.discountPct,
                        markupPct: line.markupPct,
                        installationHoursPerUnit: line.installationHoursPerUnit,
                      }}
                    />
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
          <CardTitle>{t('characteristicsCount', { count: mainCharacteristics.length })}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-slate-50 p-0">
          {mainCharacteristics.map((main) => (
            <div key={main.id} className="px-6 py-4">
              <p className="font-medium text-slate-900">{main.name}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(subCharacteristicsByParent.get(main.id) ?? []).map((sub) => (
                  <span
                    key={sub.id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"
                    title={sub.pricingMatrixId ? undefined : `${sub.formula} (valore = ${sub.value})`}
                  >
                    {sub.name}
                    {sub.pricingMatrixId && matrixById.has(sub.pricingMatrixId) ? (
                      <ProductFamilyMatrixPreview
                        familyId={family.id}
                        matrix={matrixById.get(sub.pricingMatrixId)!}
                        label={t('pricingMatrix')}
                        editable={editable}
                      />
                    ) : (
                      <ProductFamilyPricingEditor
                        kind="characteristic"
                        familyId={family.id}
                        itemId={sub.id}
                        itemName={sub.name}
                        editable={editable}
                        initial={{ value: sub.value, formula: sub.formula }}
                      />
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Only once there is something to compare; a version the caller can't see is not listed. */}
      {versionsResult.status === 'ok' && versionsResult.data.versions.length > 1 ? (
        <div className="mt-6">
          {/* Keyed so moving to another version starts a fresh comparison instead of keeping the old pair. */}
          <ProductFamilyVersions key={family.id} familyId={family.id} versions={versionsResult.data.versions} today={priceValidityToday()} />
        </div>
      ) : null}

      {/* Owning company / super-admin only (same rule as the API) — no empty panel on a shared family. */}
      {canViewHistory ? (
        <div className="mt-6">
          {/* Every server render (e.g. router.refresh() after sharing) reloads an open panel — not every change touches updatedAt. */}
          <RecordHistory endpoint={`/api/product-families/${family.id}/history`} itemNames={historyItemNames} refreshKey={new Date().toISOString()} />
        </div>
      ) : null}
    </div>
  )
}

export default ProductFamilyDetailPage
