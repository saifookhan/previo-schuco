'use client'

import { Eye, FileDown, Loader2, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { CollapsibleSection } from '@/components/collapsible-section'
import { RecordHistory } from '@/components/record-history'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FamilyVersionChanges } from '@/components/family-version-changes'
import { QuotePositionCard, type PositionFamilyVersion } from '@/components/quote-position-card'
import { cn } from '@/lib/utils'
import type { ProductFamilyDetail, ProductFamilySummary } from '@/types/product-family'
import type { AddQuotePositionInput, PricingMode, QuoteDetail, QuotePositionPreview } from '@/types/sales-quote'

const EUR = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
})

/** Matches Input's own recipe (ui/input.tsx) so a native <select> sits flush with every text field around it. */
const selectClassName =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-50'

/** A labeled section of the form, set off by a hairline rule — real grouping (product vs. size vs. pricing vs. characteristics), not decoration. */
const FormSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-4 border-t border-slate-100 pt-5 first:border-t-0 first:pt-0">
    <h3 className="text-sm font-medium text-slate-700">{title}</h3>
    {children}
  </div>
)

/**
 * The reference app's per-row "A"/"M" toggle, as a two-segment pill
 * control: Automatic (formula/matrix-computed) vs Manual (typed-in €/unit
 * value). Reused for both a position's own line price and each selected
 * characteristic's price — same shape, independent state. Manual reads
 * amber, matching the "manual price" badge shown on a saved position
 * (quote-position-card.tsx) — one color means the same thing everywhere.
 */
const PricingModeToggle = ({
  mode,
  onChange,
  autoLabel,
  manualLabel,
}: {
  mode: PricingMode
  onChange: (mode: PricingMode) => void
  autoLabel: string
  manualLabel: string
}) => (
  <div className="inline-flex shrink-0 rounded-md bg-slate-100 p-0.5 text-xs font-medium">
    <button
      type="button"
      onClick={() => onChange('auto')}
      aria-pressed={mode === 'auto'}
      className={cn(
        'rounded px-2.5 py-1 transition-colors',
        mode === 'auto' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
      )}
    >
      {autoLabel}
    </button>
    <button
      type="button"
      onClick={() => onChange('manual')}
      aria-pressed={mode === 'manual'}
      className={cn(
        'rounded px-2.5 py-1 transition-colors',
        mode === 'manual' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700',
      )}
    >
      {manualLabel}
    </button>
  </div>
)

interface QuoteBuilderProps {
  initialDetail: QuoteDetail
  families: ProductFamilySummary[]
  /** By family id: the version of the families the positions were priced from, and a newer one that can be quoted now. */
  familyVersions: Record<string, PositionFamilyVersion>
}

/** Trailing zeros from Postgres numerics ("12.5000") are noise in a display or an edit box. */
const tidy = (v: string): string => String(Number(v))

/**
 * The real quote builder: pick a product family + line (the caller's own,
 * or one shared with their company), size it, choose applicable characteristics, and add it as
 * a priced position — the server computes the price with the same
 * costing engine the catalog itself uses, so nothing is priced twice.
 * The position list is presented as sortable cards (reorder, duplicate,
 * expand for detail) matching the reference preventivo layout.
 */
export const QuoteBuilder = ({ initialDetail, families, familyVersions }: QuoteBuilderProps) => {
  const t = useTranslations('quotes')
  const [detail, setDetail] = useState(initialDetail)
  // Positions added in this session aren't in the server's map; the offered families give at least their version.
  const familyVersionOf = (familyId: string): PositionFamilyVersion | undefined => {
    const offered = families.find((f) => f.id === familyId)
    return familyVersions[familyId] ?? (offered ? { version: offered.version } : undefined)
  }
  const [familyCache, setFamilyCache] = useState<Record<string, ProductFamilyDetail>>({})
  const [familyLoading, setFamilyLoading] = useState(false)

  const [familyId, setFamilyId] = useState('')
  const [lineId, setLineId] = useState('')
  /** The position's own code ("P01", "P02", ...) — blank means "auto-assign" (add) / "leave unchanged" (edit). See the reference app's "Add POS" naming dialog. */
  const [positionCode, setPositionCode] = useState('')
  const [widthMm, setWidthMm] = useState('')
  const [heightMm, setHeightMm] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [discountPct, setDiscountPct] = useState('')
  const [extraMarkupPct, setExtraMarkupPct] = useState('')
  const [linePricingMode, setLinePricingMode] = useState<PricingMode>('auto')
  const [lineManualValue, setLineManualValue] = useState('')
  const [charPricing, setCharPricing] = useState<Record<string, { mode: PricingMode; manualValue: string }>>({})

  const [adding, setAdding] = useState(false)
  const [busyPositionId, setBusyPositionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Set while editing an existing position instead of adding a new one — the same form below is reused, pre-filled from this position, submitting a PATCH instead of a POST. */
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null)
  /** Live "what would this cost" readout, recomputed server-side (debounced) as the form's fields change — see the effect below. null = no estimate yet / current inputs aren't priceable. */
  const [preview, setPreview] = useState<QuotePositionPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewRequestId = useRef(0)

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
    setPositionCode('')
    setWidthMm('')
    setHeightMm('')
    setQuantity('1')
    setSelections({})
    setDiscountPct('')
    setExtraMarkupPct('')
    setLinePricingMode('auto')
    setLineManualValue('')
    setCharPricing({})
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
    setLinePricingMode('auto')
    setLineManualValue('')
    setCharPricing({})
    const selectedLine = family?.lines.find((l) => l.id === id)
    // On a family shared with this company the share's values for the line (same rule the API applies); otherwise the line's own.
    const shared = selectedLine ? family?.shareItems?.[selectedLine.id] : undefined
    setDiscountPct(selectedLine ? (shared ? tidy(String(shared.discountPct)) : tidy(selectedLine.discountPct ?? '0')) : '')
    setExtraMarkupPct(selectedLine ? (shared ? tidy(String(shared.markupPct)) : tidy(selectedLine.markupPct ?? '100')) : '')
  }

  const cancelEdit = () => {
    setEditingPositionId(null)
    setFamilyId('')
    resetPositionForm()
    setError(null)
  }

  /** Loads an existing position's data into the same add/edit form below — see `editingPositionId`. */
  const startEdit = async (positionId: string) => {
    const position = detail.positions.find((p) => p.id === positionId)
    if (!position) {
      return
    }
    setError(null)
    if (!familyCache[position.productFamilyId]) {
      setFamilyLoading(true)
      try {
        const response = await fetch(`/api/product-families/${position.productFamilyId}`)
        if (!response.ok) {
          setError(t('familyLoadFailed'))
          return
        }
        const data = (await response.json()) as ProductFamilyDetail
        setFamilyCache((cache) => ({
          ...cache,
          [position.productFamilyId]: data,
        }))
      } catch {
        setError(t('familyLoadFailedUnreachable'))
        return
      } finally {
        setFamilyLoading(false)
      }
    }

    setFamilyId(position.productFamilyId)
    setLineId(position.productLineId)
    setPositionCode(position.positionCode)
    setWidthMm(tidy(position.widthMm))
    setHeightMm(tidy(position.heightMm))
    setQuantity(String(position.quantity))
    setDiscountPct(tidy(position.discountPct))
    setExtraMarkupPct(tidy(position.extraMarkupPct))
    setLinePricingMode(position.pricingMode)
    setLineManualValue(position.lineManualUnitPrice != null ? tidy(position.lineManualUnitPrice) : '')
    setSelections(Object.fromEntries(position.characteristics.map((c) => [c.characteristicId, c.subCharacteristicId])))
    setCharPricing(
      Object.fromEntries(
        position.characteristics.map((c) => [
          c.characteristicId,
          {
            mode: c.pricingMode,
            manualValue: c.manualUnitPrice != null ? tidy(c.manualUnitPrice) : '',
          },
        ]),
      ),
    )
    setEditingPositionId(positionId)
  }

  // isFinite (not just "< 0") catches non-numeric input too (e.g. "abc") —
  // Number("abc") is NaN, and every comparison against NaN is false, so a
  // "< 0" check alone would silently accept it; JSON.stringify(NaN) then
  // serializes to null, reaching the server as a confusing generic error
  // instead of a friendly one.
  const isValidManualValue = (v: string) => Number.isFinite(Number(v)) && Number(v) >= 0

  /**
   * Builds the request body for add/update/preview from the form's current
   * state. `onInvalid`, when given, is called with the i18n'd reason and
   * building stops (used by `savePosition`, which shows it as an error);
   * omitted, invalid input just silently yields `null` (used by the live
   * preview below, which has nowhere good to show a validation error for
   * input the user is still in the middle of typing).
   */
  const buildPositionInput = (onInvalid?: (message: string) => void): AddQuotePositionInput | null => {
    if (!familyId || !lineId) {
      onInvalid?.(t('selectFamilyAndLine'))
      return null
    }
    const width = Number(widthMm)
    const height = Number(heightMm)
    const qty = Number(quantity)
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      onInvalid?.(t('invalidDimensions'))
      return null
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      onInvalid?.(t('invalidQuantity'))
      return null
    }
    if (linePricingMode === 'manual' && (lineManualValue.trim() === '' || !isValidManualValue(lineManualValue))) {
      onInvalid?.(t('manualValueRequired'))
      return null
    }
    const selectedCharIds = Object.entries(selections).filter(([, subId]) => subId)
    for (const [characteristicId] of selectedCharIds) {
      const pricing = charPricing[characteristicId]
      if (
        pricing?.mode === 'manual' &&
        (pricing.manualValue.trim() === '' || !isValidManualValue(pricing.manualValue))
      ) {
        onInvalid?.(t('manualValueRequired'))
        return null
      }
    }

    return {
      productFamilyId: familyId,
      productLineId: lineId,
      ...(positionCode.trim() !== '' ? { positionCode: positionCode.trim() } : {}),
      quantity: qty,
      widthMm: width,
      heightMm: height,
      characteristicSelections: selectedCharIds.map(([characteristicId, subCharacteristicId]) => {
        const pricing = charPricing[characteristicId]
        return {
          characteristicId,
          subCharacteristicId,
          ...(pricing?.mode === 'manual'
            ? {
                pricingMode: 'manual' as const,
                manualUnitPrice: Number(pricing.manualValue),
              }
            : {}),
        }
      }),
      ...(discountPct.trim() !== '' ? { discountPct: Number(discountPct) } : {}),
      ...(extraMarkupPct.trim() !== '' ? { extraMarkupPct: Number(extraMarkupPct) } : {}),
      ...(linePricingMode === 'manual'
        ? {
            pricingMode: 'manual' as const,
            manualUnitPrice: Number(lineManualValue),
          }
        : {}),
    }
  }

  // Live "estimated price" — debounced so it doesn't fire a request on
  // every keystroke, and guarded by a request-id ref so a slow earlier
  // response can never overwrite a newer one (classic race: type "1000"
  // then "800" quickly, the "1000" request can resolve after the "800"
  // one). Silent on invalid/incomplete input or a request failure — this
  // is a convenience readout, not validation (savePosition still
  // validates for real on submit).
  useEffect(() => {
    const body = buildPositionInput()
    if (!body) {
      setPreview(null)
      setPreviewLoading(false)
      return
    }
    const requestId = ++previewRequestId.current
    setPreviewLoading(true)
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/sales-quotes/${detail.quote.id}/positions/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // While editing, the position's own family stays usable even if its prices have expired since.
            body: JSON.stringify(editingPositionId ? { ...body, positionId: editingPositionId } : body),
          })
          if (requestId !== previewRequestId.current) {
            return
          }
          if (!response.ok) {
            setPreview(null)
            return
          }
          setPreview((await response.json()) as QuotePositionPreview)
        } catch {
          if (requestId === previewRequestId.current) {
            setPreview(null)
          }
        } finally {
          if (requestId === previewRequestId.current) {
            setPreviewLoading(false)
          }
        }
      })()
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildPositionInput closes over every field below already; listing the function itself would re-run on every render instead of only on real input changes.
  }, [
    detail.quote.id,
    familyId,
    lineId,
    widthMm,
    heightMm,
    quantity,
    selections,
    discountPct,
    extraMarkupPct,
    linePricingMode,
    lineManualValue,
    charPricing,
    editingPositionId,
  ])

  /** Adds a new position, or — when `editingPositionId` is set — saves changes to that existing one instead (same form, same validation). */
  const savePosition = async () => {
    const body = buildPositionInput((message) => setError(message))
    if (!body) {
      return
    }

    const isEditing = Boolean(editingPositionId)
    const url = isEditing
      ? `/api/sales-quotes/${detail.quote.id}/positions/${editingPositionId}`
      : `/api/sales-quotes/${detail.quote.id}/positions`
    const failMessage = isEditing ? t('editPositionFailed') : t('addPositionFailed')
    const failMessageUnreachable = isEditing ? t('editPositionFailedUnreachable') : t('addPositionFailedUnreachable')

    setAdding(true)
    setError(null)
    try {
      const response = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await response.json().catch(() => ({}))) as QuoteDetail & {
        error?: string
      }
      if (!response.ok) {
        setError((data as { error?: string }).error ? `${failMessage}: ${data.error}` : failMessage)
        return
      }
      setDetail(data)
      if (isEditing) {
        // Editing is a one-shot action on a specific position — fully reset,
        // unlike adding (below), which keeps family+line for fast repeat entry.
        cancelEdit()
        return
      }
      // keep family+line selected for fast repeated entry, just clear sizing
      setPositionCode('')
      setWidthMm('')
      setHeightMm('')
      setQuantity('1')
      setSelections({})
      setLinePricingMode('auto')
      setLineManualValue('')
      setCharPricing({})
    } catch {
      setError(failMessageUnreachable)
    } finally {
      setAdding(false)
    }
  }

  const withPositionBusy = async (
    positionId: string,
    action: () => Promise<Response>,
    failMessage: string,
    failMessageUnreachable: string,
  ) => {
    setBusyPositionId(positionId)
    setError(null)
    try {
      const response = await action()
      const data = (await response.json().catch(() => ({}))) as QuoteDetail & {
        error?: string
      }
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
      () =>
        fetch(`/api/sales-quotes/${detail.quote.id}/positions/${positionId}`, {
          method: 'DELETE',
        }),
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
                familyVersion={familyVersionOf(position.productFamilyId)}
                isFirst={index === 0}
                isLast={index === detail.positions.length - 1}
                busy={busyPositionId === position.id}
                onMoveUp={(id) => movePosition(id, 'up')}
                onMoveDown={(id) => movePosition(id, 'down')}
                onEdit={(id) => void startEdit(id)}
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
              <CardTitle>{editingPositionId ? t('editPositionTitle') : t('addPositionTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <FormSection title={t('sectionProduct')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="qb-family">{t('fieldFamily')}</Label>
                    <select
                      id="qb-family"
                      className={selectClassName}
                      value={familyId}
                      onChange={(e) => void onFamilyChange(e.target.value)}
                    >
                      <option value="">{t('selectFamily')}</option>
                      {families.map((f) => {
                        // Several versions of one family can be offered at once, so the version tells them apart.
                        const name = t('familyOption', { name: f.name, version: f.version })
                        return (
                          <option key={f.id} value={f.id}>
                            {/* "Con listino: No" is information for whoever quotes; the family can still be used. */}
                            {f.hasPriceList ? name : t('familyWithoutPriceList', { name })}
                          </option>
                        )
                      })}
                      {/* An edited position's family may no longer be offered (expired or unpublished); keep it selectable. */}
                      {familyId && family && !families.some((f) => f.id === familyId) ? (
                        <option value={familyId}>
                          {t('familyOption', { name: family.family.name, version: family.family.version })}
                        </option>
                      ) : null}
                    </select>
                    {family && !family.family.hasPriceList ? (
                      <p className="text-xs text-amber-700">{t('familyWithoutPriceListHint')}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="qb-line">{t('fieldLine')}</Label>
                    <select
                      id="qb-line"
                      className={selectClassName}
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
                {/* What this version changed compared with the previous one, as a tree, full width. */}
                {familyId ? <FamilyVersionChanges key={familyId} familyId={familyId} defaultOpen className="mt-3" /> : null}
              </FormSection>

              {line ? (
                <>
                  <FormSection title={t('sectionSizePosition')}>
                    <div className="grid gap-4 sm:grid-cols-4">
                      <div className="space-y-1.5 sm:col-span-1">
                        <Label htmlFor="qb-position-code">{t('fieldPositionCode')}</Label>
                        <Input
                          id="qb-position-code"
                          type="text"
                          placeholder={t('fieldPositionCodePlaceholder')}
                          value={positionCode}
                          onChange={(e) => setPositionCode(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="qb-width">{t('fieldWidth')}</Label>
                        <Input
                          id="qb-width"
                          type="number"
                          inputMode="decimal"
                          value={widthMm}
                          onChange={(e) => setWidthMm(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="qb-height">{t('fieldHeight')}</Label>
                        <Input
                          id="qb-height"
                          type="number"
                          inputMode="decimal"
                          value={heightMm}
                          onChange={(e) => setHeightMm(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
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
                  </FormSection>

                  <FormSection title={t('sectionPricing')}>
                    <div
                      className={cn(
                        'rounded-lg border p-3 transition-colors',
                        linePricingMode === 'manual' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200',
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Label className="text-slate-700">{t('fieldLineValue')}</Label>
                        <PricingModeToggle
                          mode={linePricingMode}
                          onChange={setLinePricingMode}
                          autoLabel={t('pricingModeAuto')}
                          manualLabel={t('pricingModeManual')}
                        />
                      </div>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        className="mt-2 w-full sm:w-40"
                        disabled={linePricingMode !== 'manual'}
                        placeholder={linePricingMode === 'manual' ? undefined : t('autoComputedPlaceholder')}
                        value={
                          linePricingMode === 'manual' ? lineManualValue : (preview?.lineUnitPrice?.toFixed(2) ?? '')
                        }
                        onChange={(e) => setLineManualValue(e.target.value)}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="qb-discount">{t('fieldDiscount')}</Label>
                        <div className="relative">
                          <Input
                            id="qb-discount"
                            type="number"
                            inputMode="decimal"
                            className="pr-7 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            value={discountPct}
                            onChange={(e) => setDiscountPct(e.target.value)}
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
                            %
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="qb-markup">{t('fieldMarkup')}</Label>
                        <div className="relative">
                          <Input
                            id="qb-markup"
                            type="number"
                            inputMode="decimal"
                            className="pr-7 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            value={extraMarkupPct}
                            onChange={(e) => setExtraMarkupPct(e.target.value)}
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                  </FormSection>

                  {mainCharacteristics.length > 0 ? (
                    <FormSection title={t('sectionCharacteristics')}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {mainCharacteristics.map((main) => {
                          const pricing = charPricing[main.id] ?? {
                            mode: 'auto' as PricingMode,
                            manualValue: '',
                          }
                          const isSelected = Boolean(selections[main.id])
                          return (
                            <div
                              className={cn(
                                'space-y-2 rounded-lg border p-3 transition-colors',
                                isSelected && pricing.mode === 'manual'
                                  ? 'border-amber-200 bg-amber-50/40'
                                  : 'border-slate-200',
                              )}
                              key={main.id}
                            >
                              <Label htmlFor={`qb-char-${main.id}`} className="text-slate-700">
                                {main.name}
                              </Label>
                              <select
                                id={`qb-char-${main.id}`}
                                className={selectClassName}
                                value={selections[main.id] ?? ''}
                                onChange={(e) =>
                                  setSelections((s) => ({
                                    ...s,
                                    [main.id]: e.target.value,
                                  }))
                                }
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
                              {isSelected ? (
                                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2">
                                  <PricingModeToggle
                                    mode={pricing.mode}
                                    onChange={(mode) =>
                                      setCharPricing((s) => ({
                                        ...s,
                                        [main.id]: { ...pricing, mode },
                                      }))
                                    }
                                    autoLabel={t('pricingModeAuto')}
                                    manualLabel={t('pricingModeManual')}
                                  />
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    className="h-8 w-28"
                                    disabled={pricing.mode !== 'manual'}
                                    placeholder={pricing.mode === 'manual' ? undefined : t('autoComputedPlaceholder')}
                                    value={
                                      pricing.mode === 'manual'
                                        ? pricing.manualValue
                                        : (preview?.characteristics
                                            .find((c) => c.characteristicId === main.id)
                                            ?.price.toFixed(2) ?? '')
                                    }
                                    onChange={(e) =>
                                      setCharPricing((s) => ({
                                        ...s,
                                        [main.id]: {
                                          ...pricing,
                                          manualValue: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </FormSection>
                  ) : null}

                  <div className="-mx-6 -mb-4 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-slate-100 bg-slate-50/70 px-6 py-4">
                    <div className="flex items-baseline gap-2">
                      {previewLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      ) : preview ? (
                        <>
                          <span className="text-sm text-slate-500">{t('estimatedPrice')}</span>
                          <span className="font-mono text-lg font-semibold tabular-nums text-brand">
                            {EUR.format(preview.finalPrice)}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-slate-400">{t('estimatedPricePending')}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {editingPositionId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={adding}
                          className="gap-1.5"
                          onClick={cancelEdit}
                        >
                          <X className="h-4 w-4" />
                          {t('cancelEdit')}
                        </Button>
                      ) : null}
                      <Button type="button" disabled={adding} className="gap-2" onClick={() => void savePosition()}>
                        {adding ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : editingPositionId ? null : (
                          <Plus className="h-4 w-4" />
                        )}
                        {adding ? t('saving') : editingPositionId ? t('saveChanges') : t('addPosition')}
                      </Button>
                    </div>
                  </div>
                </>
              ) : null}

              {error ? <p className="mt-5 text-sm text-red-600">{error}</p> : null}
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

          <RecordHistory
            endpoint={`/api/sales-quotes/${detail.quote.id}/history`}
            // Reordering doesn't touch the quote's updatedAt, so the position order is part of the key too.
            refreshKey={`${detail.quote.updatedAt}|${detail.positions.map((p) => p.id).join(',')}`}
          />
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
