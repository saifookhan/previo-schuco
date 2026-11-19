'use client'

import { Eye, FileDown, GitBranch, Loader2, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { RecordHistory } from '@/components/record-history'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FamilyVersionChanges } from '@/components/family-version-changes'
import { QuotePriceBreakdown, type PreviewInputs } from '@/components/quote-price-breakdown'
import { QuotePositionsNav, type PositionFamilyVersion, type QuoteBuilderView } from '@/components/quote-positions-nav'
import { EUR } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ProductFamilyDetail, ProductFamilySummary } from '@/types/product-family'
import type { AddQuotePositionInput, PricingMode, QuoteDetail, QuotePositionPreview } from '@/types/sales-quote'

/** Matches Input's own recipe (ui/input.tsx) so a native <select> sits flush with every text field around it. */
const selectClassName =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-50'

/** A labeled section of the form, set off by a hairline rule — real grouping (product vs. size vs. options vs. pricing), not decoration. */
const FormSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-3 border-t border-slate-100 pt-5 first:border-t-0 first:pt-0">
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
    {children}
  </div>
)

/** Number fields read as figures: monospaced, aligned digits, no spinner arrows. */
const numberInputClassName =
  'font-mono tabular-nums [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

/** On a phone the three panes are tabs; from `lg` the positions and the form sit side by side, from `xl` the preview too. */
type MobilePane = 'positions' | 'edit' | 'preview'

/**
 * The reference app's per-row "A"/"M" toggle, as a two-segment pill
 * control: Automatic (formula/matrix-computed) vs Manual (typed-in €/unit
 * value). Reused for both a position's own line price and each selected
 * characteristic's price — same shape, independent state. Manual reads
 * amber, and so does the row or field it switches to manual.
 */
const PricingModeToggle = ({
  mode,
  onChange,
  autoLabel,
  manualLabel,
  autoTitle,
  manualTitle,
}: {
  mode: PricingMode
  onChange: (mode: PricingMode) => void
  autoLabel: string
  manualLabel: string
  /** The full words behind the one-letter labels. */
  autoTitle: string
  manualTitle: string
}) => (
  <div className="inline-flex w-fit shrink-0 justify-self-start rounded-md bg-slate-100 p-0.5 text-xs font-medium">
    <button
      type="button"
      onClick={() => onChange('auto')}
      aria-pressed={mode === 'auto'}
      title={autoTitle}
      aria-label={autoTitle}
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
      title={manualTitle}
      aria-label={manualTitle}
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
 * Laid out like an editor: the positions on the left (select one to edit it), the form in the
 * middle, and on the right a live preview — how the price is built, or the quote's PDF.
 */
export const QuoteBuilder = ({ initialDetail, families, familyVersions }: QuoteBuilderProps) => {
  const t = useTranslations('quotes')
  const tVersions = useTranslations('productFamilyVersions')
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
  /** The form as it was when `preview` was asked for, so the calculation panel never mixes old prices with new inputs. */
  const [previewInputs, setPreviewInputs] = useState<PreviewInputs | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  /** Why the server couldn't price the current inputs, for the calculation panel. */
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previewRequestId = useRef(0)
  const [showOverview, setShowOverview] = useState(false)
  const [previewTab, setPreviewTab] = useState<'calc' | 'pdf'>('calc')
  const [mobilePane, setMobilePane] = useState<MobilePane>('edit')
  const view: QuoteBuilderView = showOverview
    ? { kind: 'overview' }
    : editingPositionId
      ? { kind: 'position', id: editingPositionId }
      : { kind: 'new' }
  const editingPosition = detail.positions.find((p) => p.id === editingPositionId)

  const family = familyCache[familyId]
  const line = family?.lines.find((l) => l.id === lineId)
  const mainCharacteristics = family
    ? family.relations
        .filter((rel) => rel.productLineId === lineId)
        .map((rel) => family.characteristics.find((c) => c.id === rel.characteristicId && !c.parentId))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
    : []
  /** "Colore: RAL 9010" for each chosen option, by characteristic id — for the calculation panel. */
  const optionLabels: Record<string, string> = Object.fromEntries(
    mainCharacteristics.flatMap((main) => {
      const sub = family?.characteristics.find((c) => c.id === selections[main.id])
      return sub ? [[main.id, `${main.name}: ${sub.name}`]] : []
    }),
  )

  /**
   * Bumped whenever the form switches to another position, a new one or another family, so a
   * family that finishes loading for an earlier choice doesn't overwrite the current one.
   */
  const formRequestId = useRef(0)
  // Everything the form holds; it is "dirty" once it differs from what was last loaded or saved.
  const formSnapshot = JSON.stringify([
    familyId,
    lineId,
    positionCode,
    widthMm,
    heightMm,
    quantity,
    selections,
    discountPct,
    extraMarkupPct,
    linePricingMode,
    lineManualValue,
    charPricing,
  ])
  const [cleanSnapshot, setCleanSnapshot] = useState(formSnapshot)
  /** Set by whatever loads or saves the form; the next render takes its state as the clean one. */
  const markCleanPending = useRef(false)
  const markClean = () => {
    markCleanPending.current = true
  }
  useEffect(() => {
    if (markCleanPending.current) {
      markCleanPending.current = false
      setCleanSnapshot(formSnapshot)
    }
  })
  const isDirty = formSnapshot !== cleanSnapshot

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

  /** The family's detail, from the cache or the server; null (with the error shown) if it can't be loaded. */
  const loadFamily = async (id: string): Promise<ProductFamilyDetail | null> => {
    if (familyCache[id]) {
      return familyCache[id]
    }
    setFamilyLoading(true)
    try {
      const response = await fetch(`/api/product-families/${id}`)
      if (!response.ok) {
        setError(t('familyLoadFailed'))
        return null
      }
      const data = (await response.json()) as ProductFamilyDetail
      setFamilyCache((cache) => ({ ...cache, [id]: data }))
      return data
    } catch {
      setError(t('familyLoadFailedUnreachable'))
      return null
    } finally {
      setFamilyLoading(false)
    }
  }

  /**
   * Picks another family. The code, size and quantity stay; so do the line and options when the
   * new family has ones with the same names — switching a position to a newer version keeps it.
   */
  const onFamilyChange = async (id: string) => {
    const requestId = ++formRequestId.current
    const previousFamily = family
    const previousLine = line
    const previousSelections = selections
    setFamilyId(id)
    setLineId('')
    setSelections({})
    setDiscountPct('')
    setExtraMarkupPct('')
    setLinePricingMode('auto')
    setLineManualValue('')
    setCharPricing({})
    setError(null)
    if (!id) {
      return
    }
    const next = await loadFamily(id)
    const nextLine = next?.lines.find((l) => l.name === previousLine?.name)
    if (!next || !nextLine || requestId !== formRequestId.current) {
      return
    }
    onLineChange(nextLine.id, next)
    const nameOf = (characteristicId: string) => previousFamily?.characteristics.find((c) => c.id === characteristicId)?.name
    setSelections(
      Object.fromEntries(
        Object.entries(previousSelections).flatMap(([mainId, subId]) => {
          const main = next.characteristics.find((c) => !c.parentId && c.name === nameOf(mainId))
          const sub = main && next.characteristics.find((c) => c.parentId === main.id && c.name === nameOf(subId))
          return main && sub ? [[main.id, sub.id]] : []
        }),
      ),
    )
  }

  const onLineChange = (id: string, lineFamily: ProductFamilyDetail | undefined = family) => {
    setLineId(id)
    setSelections({})
    setLinePricingMode('auto')
    setLineManualValue('')
    setCharPricing({})
    const selectedLine = lineFamily?.lines.find((l) => l.id === id)
    // On a family shared with this company the share's values for the line (same rule the API applies); otherwise the line's own.
    const shared = selectedLine ? lineFamily?.shareItems?.[selectedLine.id] : undefined
    setDiscountPct(selectedLine ? (shared ? tidy(String(shared.discountPct)) : tidy(selectedLine.discountPct ?? '0')) : '')
    setExtraMarkupPct(selectedLine ? (shared ? tidy(String(shared.markupPct)) : tidy(selectedLine.markupPct ?? '100')) : '')
  }

  const cancelEdit = () => {
    formRequestId.current++
    setEditingPositionId(null)
    setFamilyId('')
    resetPositionForm()
    setError(null)
    markClean()
  }

  /** Loads an existing position's data into the same add/edit form below — see `editingPositionId`. */
  const startEdit = async (positionId: string) => {
    const position = detail.positions.find((p) => p.id === positionId)
    if (!position) {
      return
    }
    const requestId = ++formRequestId.current
    setError(null)
    // The user may have picked something else while the family was loading.
    if (!(await loadFamily(position.productFamilyId)) || requestId !== formRequestId.current) {
      return
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
    markClean()
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
      setPreviewError(null)
      setPreviewLoading(false)
      return
    }
    const requestId = ++previewRequestId.current
    const inputs = line ? { line, linePricingMode, quantity: body.quantity, optionLabels } : null
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
            const data = (await response.json().catch(() => ({}))) as { error?: string }
            setPreview(null)
            setPreviewError(data.error ?? t('previewFailed'))
            return
          }
          setPreview((await response.json()) as QuotePositionPreview)
          setPreviewInputs(inputs)
          setPreviewError(null)
        } catch {
          if (requestId === previewRequestId.current) {
            setPreview(null)
            setPreviewError(t('previewFailed'))
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
        // The position stays selected, now showing what was saved.
        markClean()
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
      markClean()
    } catch {
      setError(failMessageUnreachable)
    } finally {
      setAdding(false)
    }
  }

  /** Runs one action on a position; true when the server accepted it. */
  const withPositionBusy = async (
    positionId: string,
    action: () => Promise<Response>,
    failMessage: string,
    failMessageUnreachable: string,
  ): Promise<boolean> => {
    setBusyPositionId(positionId)
    setError(null)
    try {
      const response = await action()
      const data = (await response.json().catch(() => ({}))) as QuoteDetail & {
        error?: string
      }
      if (!response.ok) {
        setError((data as { error?: string }).error ? `${failMessage}: ${data.error}` : failMessage)
        return false
      }
      setDetail(data)
      return true
    } catch {
      setError(failMessageUnreachable)
      return false
    } finally {
      setBusyPositionId(null)
    }
  }

  const removePosition = async (positionId: string) => {
    const removed = await withPositionBusy(
      positionId,
      () =>
        fetch(`/api/sales-quotes/${detail.quote.id}/positions/${positionId}`, {
          method: 'DELETE',
        }),
      t('removePositionFailed'),
      t('removePositionFailedUnreachable'),
    )
    // The form can't keep editing a position that's gone.
    if (removed && positionId === editingPositionId) {
      cancelEdit()
    }
  }

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

  const select = (next: QuoteBuilderView) => {
    // The overview leaves the form as it is; anything else replaces it.
    const replacesForm = next.kind === 'new' ? Boolean(editingPositionId) : next.kind === 'position' && next.id !== editingPositionId
    if (replacesForm && isDirty && !window.confirm(t('discardChanges'))) {
      return
    }
    setMobilePane('edit')
    if (next.kind === 'overview') {
      setShowOverview(true)
      return
    }
    setShowOverview(false)
    if (next.kind === 'new' && editingPositionId) {
      cancelEdit()
    } else if (next.kind === 'position' && next.id !== editingPositionId) {
      void startEdit(next.id)
    }
  }
  // The PDF shows the saved quote, so it reloads whenever that changes — but only while it is on
  // screen; it isn't loaded before the PDF tab is first opened, nor again on every tab switch.
  const pdfKey = `${detail.quote.updatedAt}|${detail.positions.map((p) => `${p.id}:${p.finalPrice}`).join(',')}`
  const [shownPdfKey, setShownPdfKey] = useState<string | null>(null)
  useEffect(() => {
    if (previewTab === 'pdf') {
      setShownPdfKey(pdfKey)
    }
  }, [previewTab, pdfKey])
  const paneClassName = (pane: MobilePane) => (mobilePane === pane ? 'block' : 'hidden')

  return (
    <div className="min-h-[100dvh] bg-slate-50 pb-10">
      <div className="sticky top-0 z-30 w-full border-b bg-white/90 shadow-md backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="min-w-0 truncate rounded-md bg-brand px-2.5 py-1 text-[13px] font-semibold tracking-wide text-white">
              {detail.quote.reference}
            </span>
            {detail.quote.status !== 'draft' ? (
              <Badge variant="muted">{t(`statusValue.${detail.quote.status}`)}</Badge>
            ) : null}
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

          <div className="flex flex-shrink-0 items-center gap-2 sm:gap-4">
            <div className="flex flex-col items-end">
              <div className="font-mono text-[22px] font-bold tabular-nums leading-none text-brand md:text-[28px]">
                {EUR.format(Number(detail.quote.totalPrice))}
              </div>
              <div className="mt-0.5 hidden text-[11px] font-medium uppercase tracking-wider text-slate-500 sm:block">
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

      <main className="mx-auto max-w-[1600px] px-4 md:px-6">
        {/* Phones: one pane at a time. */}
        <div role="tablist" aria-label={t('panesLabel')} className="mt-4 grid grid-cols-3 rounded-lg bg-slate-200/70 p-0.5 text-sm font-medium lg:hidden">
          {(['positions', 'edit', 'preview'] as const).map((pane) => (
            <button
              key={pane}
              type="button"
              role="tab"
              aria-selected={mobilePane === pane}
              onClick={() => setMobilePane(pane)}
              className={cn(
                'rounded-md px-2 py-1.5 transition-colors',
                mobilePane === pane ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {t(`pane.${pane}`)}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_380px]">
          <aside
            className={cn(
              paneClassName('positions'),
              'lg:sticky lg:top-24 lg:row-span-2 lg:block lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto xl:row-span-1',
            )}
          >
            <QuotePositionsNav
              positions={detail.positions}
              total={detail.quote.totalPrice}
              view={view}
              busyPositionId={busyPositionId}
              familyVersionOf={familyVersionOf}
              onSelect={select}
              onMoveUp={(id) => movePosition(id, 'up')}
              onMoveDown={(id) => movePosition(id, 'down')}
              onDuplicate={duplicatePosition}
              onDelete={removePosition}
            />
          </aside>

          <section className={cn(paneClassName('edit'), 'min-w-0 space-y-3 lg:block')}>
            {error ? (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            {view.kind === 'overview' ? (
              <>
                {detail.quote.introText ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('introTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-line text-sm text-slate-600">{detail.quote.introText}</p>
                    </CardContent>
                  </Card>
                ) : null}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('summaryTitle')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {detail.positions.map((p) => (
                      <div key={p.id} className="flex justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="mr-2 font-mono text-xs text-slate-400">{p.positionCode}</span>
                          {p.productLineName}
                        </span>
                        <span className="flex-shrink-0 font-mono tabular-nums">{EUR.format(Number(p.finalPrice))}</span>
                      </div>
                    ))}
                    {detail.positions.length === 0 ? <p className="text-sm text-slate-400">{t('noPositions')}</p> : null}
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
                  </CardContent>
                </Card>
                <RecordHistory
                  endpoint={`/api/sales-quotes/${detail.quote.id}/history`}
                  // Reordering doesn't touch the quote's updatedAt, so the position order is part of the key too.
                  refreshKey={`${detail.quote.updatedAt}|${detail.positions.map((p) => p.id).join(',')}`}
                />
              </>
            ) : (
              <Card>
                <CardHeader className="space-y-1">
                  {editingPosition ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{editingPosition.positionCode}</span>
                        <CardTitle className="min-w-0 truncate">{editingPosition.productLineName}</CardTitle>
                        <span
                          title={editingPosition.isValid ? t('validHint') : t('invalidHint')}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                            editingPosition.isValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', editingPosition.isValid ? 'bg-green-500' : 'bg-red-500')} />
                          {editingPosition.isValid ? t('valid') : t('invalid')}
                        </span>
                      </div>
                      {/* What the PDF prints for this position (the line and its options, or the user's own text). */}
                      <p className="line-clamp-2 text-xs text-slate-500">{editingPosition.description || t('editPositionTitle')}</p>
                    </>
                  ) : (
                    <CardTitle>{t('addPositionTitle')}</CardTitle>
                  )}
                </CardHeader>
                <CardContent>
                  {(() => {
                    // A position priced from an older version: what the newest quotable one changes.
                    const newer = editingPosition ? familyVersionOf(editingPosition.productFamilyId)?.newer : undefined
                    return newer && editingPosition ? (
                      <div className="mb-5 space-y-1 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                          <GitBranch className="h-3.5 w-3.5" />
                          {tVersions('newerAvailable', { version: newer.version })} — {tVersions('newerAvailableHint')}
                        </p>
                        <FamilyVersionChanges familyId={newer.id} fromId={editingPosition.productFamilyId} />
                      </div>
                    ) : null
                  })()}
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
                    {familyId ? <FamilyVersionChanges key={familyId} familyId={familyId} defaultOpen={!editingPositionId} /> : null}
                  </FormSection>

                  {line ? (
                    <>
                      <FormSection title={t('sectionSizePosition')}>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                          <div className="col-span-2 space-y-1.5 sm:col-span-1">
                            <Label htmlFor="qb-position-code">{t('fieldPositionCode')}</Label>
                            <Input
                              id="qb-position-code"
                              type="text"
                              className="font-mono"
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
                              className={numberInputClassName}
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
                              className={numberInputClassName}
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
                              className={numberInputClassName}
                              value={quantity}
                              onChange={(e) => setQuantity(e.target.value)}
                            />
                          </div>
                        </div>
                      </FormSection>

                      {mainCharacteristics.length > 0 ? (
                        <FormSection title={t('sectionCharacteristics')}>
                          {/* One row per characteristic: its option, then (once chosen) automatic or manual price. */}
                          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                            {mainCharacteristics.map((main) => {
                              const pricing = charPricing[main.id] ?? {
                                mode: 'auto' as PricingMode,
                                manualValue: '',
                              }
                              const isSelected = Boolean(selections[main.id])
                              return (
                                <div
                                  key={main.id}
                                  className={cn(
                                    'grid items-center gap-2 px-3 py-2 transition-colors sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto_7rem]',
                                    isSelected && pricing.mode === 'manual' && 'bg-amber-50/50',
                                  )}
                                >
                                  <Label htmlFor={`qb-char-${main.id}`} className="truncate text-slate-700">
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
                                    <>
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
                                        autoTitle={t('pricingModeAutoLabel')}
                                        manualTitle={t('pricingModeManualLabel')}
                                      />
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        aria-label={t('optionPriceFor', { name: main.name })}
                                        className={cn('h-9', numberInputClassName)}
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
                                    </>
                                  ) : (
                                    <span className="hidden sm:col-span-2 sm:block" />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </FormSection>
                      ) : null}

                      <FormSection title={t('sectionPricing')}>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div
                            className={cn(
                              'space-y-1.5 rounded-lg transition-colors',
                              linePricingMode === 'manual' && '-m-2 bg-amber-50/50 p-2',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor="qb-line-value">{t('fieldLineValue')}</Label>
                              <PricingModeToggle
                                mode={linePricingMode}
                                onChange={setLinePricingMode}
                                autoLabel={t('pricingModeAuto')}
                                manualLabel={t('pricingModeManual')}
                                autoTitle={t('pricingModeAutoLabel')}
                                manualTitle={t('pricingModeManualLabel')}
                              />
                            </div>
                            <Input
                              id="qb-line-value"
                              type="number"
                              inputMode="decimal"
                              min="0"
                              className={numberInputClassName}
                              disabled={linePricingMode !== 'manual'}
                              placeholder={linePricingMode === 'manual' ? undefined : t('autoComputedPlaceholder')}
                              value={
                                linePricingMode === 'manual' ? lineManualValue : (preview?.lineUnitPrice?.toFixed(2) ?? '')
                              }
                              onChange={(e) => setLineManualValue(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="qb-discount">{t('fieldDiscount')}</Label>
                            <div className="relative">
                              <Input
                                id="qb-discount"
                                type="number"
                                inputMode="decimal"
                                className={cn('pr-7', numberInputClassName)}
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
                                className={cn('pr-7', numberInputClassName)}
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
                          <Button
                            type="button"
                            variant="ghost"
                            className="xl:hidden"
                            onClick={() => {
                              setPreviewTab('calc')
                              setMobilePane('preview')
                              document.getElementById('qb-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            }}
                          >
                            {t('showCalculation')}
                          </Button>
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
                </CardContent>
              </Card>
            )}
          </section>

          <aside
            id="qb-preview"
            aria-label={t('previewLabel')}
            className={cn(
              paneClassName('preview'),
              'scroll-mt-24 lg:block xl:sticky xl:top-24 xl:col-start-3 xl:row-start-1 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto',
            )}
          >
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div role="tablist" aria-label={t('previewLabel')} className="flex gap-1 border-b border-slate-100 p-1.5">
                {(['calc', 'pdf'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={previewTab === tab}
                    onClick={() => setPreviewTab(tab)}
                    className={cn(
                      'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      previewTab === tab ? 'bg-brand/10 text-brand' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                    )}
                  >
                    {t(`previewTab.${tab}`)}
                  </button>
                ))}
              </div>
              {previewTab === 'calc' ? (
                <div className="p-4">
                  <QuotePriceBreakdown
                    preview={view.kind === 'overview' ? null : preview}
                    inputs={previewInputs}
                    error={view.kind === 'overview' || !line ? null : previewError}
                    loading={view.kind !== 'overview' && previewLoading}
                    emptyMessage={view.kind === 'overview' ? t('calcSelectPosition') : undefined}
                  />
                </div>
              ) : null}
              {shownPdfKey ? (
                <div className={cn('space-y-2 p-2', previewTab !== 'pdf' && 'hidden')}>
                  <iframe
                    key={shownPdfKey}
                    title={t('previewTab.pdf')}
                    src={`/api/sales-quotes/${detail.quote.id}/pdf#view=FitH`}
                    className="h-[70vh] w-full rounded-lg border border-slate-200 bg-slate-100 xl:h-[calc(100dvh-15rem)]"
                  />
                  <p className="px-1 text-[11px] text-slate-400">{t('pdfSavedOnly')}</p>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
