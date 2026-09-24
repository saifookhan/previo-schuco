'use client'

import { Eye, FileDown, Loader2, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CollapsibleSection } from '@/components/collapsible-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { QuotePositionCard } from '@/components/quote-position-card'
import type { ProductFamilyDetail, ProductFamilySummary } from '@/types/product-family'
import type { AddQuotePositionInput, QuoteDetail } from '@/types/sales-quote'

const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

interface QuoteBuilderProps {
  initialDetail: QuoteDetail
  families: ProductFamilySummary[]
}

/** Trailing zeros from Postgres numerics ("12.5000") are noise in a display or an edit box. */
const tidy = (v: string): string => String(Number(v))

/**
 * The real quote builder: pick a product family + line from the caller's
 * own catalog, size it, choose applicable characteristics, and add it as
 * a priced position — the server computes the price with the same
 * costing engine the catalog itself uses, so nothing is priced twice.
 * The position list is presented as sortable cards (reorder, duplicate,
 * expand for detail) matching the reference preventivo layout.
 */
export const QuoteBuilder = ({ initialDetail, families }: QuoteBuilderProps) => {
  const t = useTranslations('quotes')
  const [detail, setDetail] = useState(initialDetail)
  const [familyCache, setFamilyCache] = useState<Record<string, ProductFamilyDetail>>({})
  const [familyLoading, setFamilyLoading] = useState(false)

  const [familyId, setFamilyId] = useState('')
  const [lineId, setLineId] = useState('')
  const [widthMm, setWidthMm] = useState('')
  const [heightMm, setHeightMm] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [discountPct, setDiscountPct] = useState('')
  const [extraMarkupPct, setExtraMarkupPct] = useState('')

  const [adding, setAdding] = useState(false)
  const [busyPositionId, setBusyPositionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const family = familyCache[familyId]
  const line = family?.lines.find((l) => l.id === lineId)
  const mainCharacteristics = family
    ? family.relations
        .filter((rel) => rel.productLineId === lineId)
        .map((rel) => family.characteristics.find((c) => c.id === rel.characteristicId && !c.parentId))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
    : []

  const resetPositionForm = () => {
    setLineId('')
    setWidthMm('')
    setHeightMm('')
    setQuantity('1')
    setSelections({})
    setDiscountPct('')
    setExtraMarkupPct('')
  }

  const onFamilyChange = async (id: string) => {
    setFamilyId(id)
    resetPositionForm()
    setError(null)
    if (!id || familyCache[id]) {
      return
    }
    setFamilyLoading(true)
    try {
      const response = await fetch(`/api/product-families/${id}`)
      if (!response.ok) {
        setError(t('familyLoadFailed'))
        return
      }
      const data = (await response.json()) as ProductFamilyDetail
      setFamilyCache((cache) => ({ ...cache, [id]: data }))
    } catch {
      setError(t('familyLoadFailedUnreachable'))
    } finally {
      setFamilyLoading(false)
    }
  }

  const onLineChange = (id: string) => {
    setLineId(id)
    setSelections({})
    const selectedLine = family?.lines.find((l) => l.id === id)
    setDiscountPct(selectedLine ? tidy(selectedLine.discountPct) : '')
    setExtraMarkupPct(selectedLine ? tidy(selectedLine.markupPct) : '')
  }

  const addPosition = async () => {
    if (!familyId || !lineId) {
      setError(t('selectFamilyAndLine'))
      return
    }
    const width = Number(widthMm)
    const height = Number(heightMm)
    const qty = Number(quantity)
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      setError(t('invalidDimensions'))
      return
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      setError(t('invalidQuantity'))
      return
    }

    const body: AddQuotePositionInput = {
      productFamilyId: familyId,
      productLineId: lineId,
      quantity: qty,
      widthMm: width,
      heightMm: height,
      characteristicSelections: Object.entries(selections)
        .filter(([, subId]) => subId)
        .map(([characteristicId, subCharacteristicId]) => ({ characteristicId, subCharacteristicId })),
      ...(discountPct.trim() !== '' ? { discountPct: Number(discountPct) } : {}),
      ...(extraMarkupPct.trim() !== '' ? { extraMarkupPct: Number(extraMarkupPct) } : {}),
    }

    setAdding(true)
    setError(null)
    try {
      const response = await fetch(`/api/sales-quotes/${detail.quote.id}/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await response.json().catch(() => ({}))) as QuoteDetail & { error?: string }
      if (!response.ok) {
        setError((data as { error?: string }).error ? `${t('addPositionFailed')}: ${data.error}` : t('addPositionFailed'))
        return
      }
      setDetail(data)
      // keep family+line selected for fast repeated entry, just clear sizing
      setWidthMm('')
      setHeightMm('')
      setQuantity('1')
      setSelections({})
    } catch {
      setError(t('addPositionFailedUnreachable'))
    } finally {
      setAdding(false)
    }
  }

  const withPositionBusy = async (positionId: string, action: () => Promise<Response>, failMessage: string, failMessageUnreachable: string) => {
    setBusyPositionId(positionId)
    setError(null)
    try {
      const response = await action()
      const data = (await response.json().catch(() => ({}))) as QuoteDetail & { error?: string }
      if (!response.ok) {
        setError((data as { error?: string }).error ? `${failMessage}: ${data.error}` : failMessage)
        return
      }
      setDetail(data)
    } catch {
      setError(failMessageUnreachable)
    } finally {
      setBusyPositionId(null)
    }
  }

  const removePosition = (positionId: string) =>
    withPositionBusy(
      positionId,
      () => fetch(`/api/sales-quotes/${detail.quote.id}/positions/${positionId}`, { method: 'DELETE' }),
      t('removePositionFailed'),
      t('removePositionFailedUnreachable'),
    )

  const duplicatePosition = (positionId: string) =>
    withPositionBusy(
      positionId,
      () => fetch(`/api/sales-quotes/${detail.quote.id}/positions/${positionId}/duplicate`, { method: 'POST' }),
      t('duplicatePositionFailed'),
      t('duplicatePositionFailedUnreachable'),
    )

  const reorder = (positionIds: string[], busyId: string) =>
    withPositionBusy(
      busyId,
      () =>
        fetch(`/api/sales-quotes/${detail.quote.id}/positions/reorder`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positionIds }),
        }),
      t('reorderFailed'),
      t('reorderFailedUnreachable'),
    )

  const movePosition = (positionId: string, direction: 'up' | 'down') => {
    const index = detail.positions.findIndex((p) => p.id === positionId)
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (index === -1 || swapIndex < 0 || swapIndex >= detail.positions.length) {
      return
    }
    const ids = detail.positions.map((p) => p.id)
    ;[ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]]
    void reorder(ids, positionId)
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 pb-10">
      <div className="sticky top-0 z-30 w-full border-b bg-white/90 shadow-md backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex-shrink-0 rounded-md bg-brand px-2.5 py-1 text-[13px] font-semibold tracking-wide text-white">
              {detail.quote.reference}
            </span>
            <span className="hidden h-5 w-px flex-shrink-0 bg-slate-200 md:block" />
            <div className="hidden min-w-0 flex-col md:flex">
              <span className="mb-0.5 text-[11px] font-medium uppercase leading-none tracking-wider text-slate-400">
                {t('clientLabel')}
              </span>
              <span className="max-w-[220px] truncate text-[14px] font-semibold text-slate-800">
                {detail.quote.customerName}
              </span>
            </div>
            {detail.quote.projectLocation ? (
              <>
                <span className="hidden h-5 w-px flex-shrink-0 bg-slate-200 lg:block" />
                <div className="hidden min-w-0 flex-col lg:flex">
                  <span className="mb-0.5 text-[11px] font-medium uppercase leading-none tracking-wider text-slate-400">
                    {t('projectLabel')}
                  </span>
                  <span className="max-w-[260px] truncate text-[14px] font-medium text-slate-600">
                    {detail.quote.projectLocation}
                  </span>
                </div>
              </>
            ) : null}
          </div>

          <div className="flex flex-shrink-0 items-center gap-4">
            <div className="flex flex-col items-end">
              <div className="font-mono text-[22px] font-bold tabular-nums leading-none text-brand md:text-[28px]">
                {EUR.format(Number(detail.quote.totalPrice))}
              </div>
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                {t('totalLabel')}
              </div>
            </div>
            <a href={`/api/sales-quotes/${detail.quote.id}/pdf`} target="_blank" rel="noreferrer">
              <Button variant="icon" size="icon" title={t('previewPdf')} aria-label={t('previewPdf')}>
                <Eye className="h-4 w-4" />
              </Button>
            </a>
            <a href={`/api/sales-quotes/${detail.quote.id}/pdf`} target="_blank" rel="noreferrer" download>
              <Button variant="icon" size="icon" title={t('downloadPdf')} aria-label={t('downloadPdf')}>
                <FileDown className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1200px] px-4 md:px-6">
        <div className="mt-4 flex flex-col gap-3">
          {detail.quote.introText ? (
            <CollapsibleSection title={t('introTitle')} preview={detail.quote.introText} ariaLabel={t('introTitle')}>
              <p className="whitespace-pre-line">{detail.quote.introText}</p>
            </CollapsibleSection>
          ) : null}

          <div className="flex flex-col gap-3">
            {detail.positions.map((position, index) => (
              <QuotePositionCard
                key={position.id}
                position={position}
                isFirst={index === 0}
                isLast={index === detail.positions.length - 1}
                busy={busyPositionId === position.id}
                onMoveUp={(id) => movePosition(id, 'up')}
                onMoveDown={(id) => movePosition(id, 'down')}
                onDuplicate={duplicatePosition}
                onDelete={removePosition}
              />
            ))}
            {detail.positions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-400">
                {t('noPositions')}
              </div>
            ) : null}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('addPositionTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="qb-family">{t('fieldFamily')}</Label>
                  <select
                    id="qb-family"
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    value={familyId}
                    onChange={(e) => void onFamilyChange(e.target.value)}
                  >
                    <option value="">{t('selectFamily')}</option>
                    {families.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="qb-line">{t('fieldLine')}</Label>
                  <select
                    id="qb-line"
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-50"
                    value={lineId}
                    disabled={!family || familyLoading}
                    onChange={(e) => onLineChange(e.target.value)}
                  >
                    <option value="">{familyLoading ? t('loadingFamily') : t('selectLine')}</option>
                    {family?.lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {line ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="qb-width">{t('fieldWidth')}</Label>
                      <Input
                        id="qb-width"
                        type="number"
                        inputMode="decimal"
                        value={widthMm}
                        onChange={(e) => setWidthMm(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="qb-height">{t('fieldHeight')}</Label>
                      <Input
                        id="qb-height"
                        type="number"
                        inputMode="decimal"
                        value={heightMm}
                        onChange={(e) => setHeightMm(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="qb-qty">{t('fieldQuantity')}</Label>
                      <Input
                        id="qb-qty"
                        type="number"
                        inputMode="numeric"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                      />
                    </div>
                  </div>

                  {mainCharacteristics.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {mainCharacteristics.map((main) => (
                        <div className="space-y-1" key={main.id}>
                          <Label htmlFor={`qb-char-${main.id}`}>{main.name}</Label>
                          <select
                            id={`qb-char-${main.id}`}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                            value={selections[main.id] ?? ''}
                            onChange={(e) => setSelections((s) => ({ ...s, [main.id]: e.target.value }))}
                          >
                            <option value="">{t('noSelection')}</option>
                            {family!.characteristics
                              .filter((c) => c.parentId === main.id)
                              .map((sub) => (
                                <option key={sub.id} value={sub.id}>
                                  {sub.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="qb-discount">{t('fieldDiscount')}</Label>
                      <Input
                        id="qb-discount"
                        type="number"
                        inputMode="decimal"
                        value={discountPct}
                        onChange={(e) => setDiscountPct(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="qb-markup">{t('fieldMarkup')}</Label>
                      <Input
                        id="qb-markup"
                        type="number"
                        inputMode="decimal"
                        value={extraMarkupPct}
                        onChange={(e) => setExtraMarkupPct(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button type="button" disabled={adding} className="gap-2" onClick={() => void addPosition()}>
                      {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {adding ? t('adding') : t('addPosition')}
                    </Button>
                  </div>
                </>
              ) : null}

              {error ? <p className="text-xs text-red-600">{error}</p> : null}
            </CardContent>
          </Card>

          <CollapsibleSection
            title={t('summaryTitle')}
            rightContent={
              <span className="ml-2 font-mono text-[13px] tabular-nums text-slate-400">
                {EUR.format(Number(detail.quote.totalPrice))}
              </span>
            }
            ariaLabel={t('summaryTitle')}
          >
            <div className="space-y-2">
              {detail.positions.map((p) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span>
                    {p.positionCode} — {p.productLineName}
                  </span>
                  <span className="font-mono tabular-nums">{EUR.format(Number(p.finalPrice))}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-brand">
                <span>{t('total')}</span>
                <span className="font-mono tabular-nums">{EUR.format(Number(detail.quote.totalPrice))}</span>
              </div>
              {detail.quote.paymentTerms ? (
                <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">
                  {t('fieldPaymentTerms')}: {detail.quote.paymentTerms}
                </p>
              ) : null}
              <p className="text-xs text-slate-400">{t('validityNote', { days: detail.quote.validityDays })}</p>
            </div>
          </CollapsibleSection>
        </div>
      </main>

      {detail.quote.status !== 'draft' ? (
        <div className="mx-auto mt-4 max-w-[1200px] px-4 md:px-6">
          <Badge variant="muted">{t(`statusValue.${detail.quote.status}`)}</Badge>
        </div>
      ) : null}
    </div>
  )
}
