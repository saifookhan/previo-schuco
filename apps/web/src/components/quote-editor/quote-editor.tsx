'use client'

import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  quoteTotal,
  quoteVariantCode,
  type CompanyProfileResponse,
  type PricedLine,
  type QuoteDocument,
  type QuoteFamily,
  type QuoteRevisionDetail,
  type QuoteStatus,
  type QuoteVariantRef,
  type SalesQuoteDetailResponse,
  type TextTemplate,
} from '@schuco/contracts'
import { AlertTriangle, ArrowLeft, Info, Plus, RotateCcw, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { QuoteChat } from '@/components/quote-chat/quote-chat'
import { useAuth } from '@/hooks/use-auth'
import { Link, useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import type { ProductFamilyDetail, ProductFamilySummary } from '@/types/product-family'

import { previewStorageKey } from './preview-storage'
import { catalogPricingKey, emptyFamily, familyFromCatalog, switchFamilyVersion } from './catalog'
import { QuoteEditorProvider, type LinePriceErrors } from './context'
import { QuoteClosing } from './quote-closing'
import { QuoteFamilyCard } from './quote-family-card'
import { QuoteFamilyPicker } from './quote-family-picker'
import { QuoteHistoryPanel } from './quote-history-panel'
import { QuoteIntro } from './quote-intro'
import { QuoteSaveDialog } from './quote-save-dialog'
import { QuoteTopBar } from './quote-top-bar'
import { QuoteVariantMatrix } from './quote-variant-matrix'
import { moveItem, newLocalId, reorderOnDrop, useDragSensors, useSortableItem } from './shared'

const PRICE_LINES_BATCH = 500

const errorMessage = async (response: Response, fallback: string): Promise<string> => {
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  return body?.error ?? fallback
}

const loadFamilyDetail = async (familyId: string): Promise<ProductFamilyDetail | null> => {
  const response = await fetch(`/api/product-families/${familyId}`)
  return response.ok ? ((await response.json()) as ProductFamilyDetail) : null
}

const SortableFamily = (props: Omit<Parameters<typeof QuoteFamilyCard>[0], 'dragHandleProps'>) => {
  const { setNodeRef, style, handleProps } = useSortableItem(props.family.id)
  return (
    <div ref={setNodeRef} style={style}>
      <QuoteFamilyCard {...props} dragHandleProps={handleProps} />
    </div>
  )
}

interface QuoteEditorProps {
  initialDetail: SalesQuoteDetailResponse
  /** The catalog families new ones can be added from (usable today). */
  families: ProductFamilySummary[]
  profile: CompanyProfileResponse | null
  initialTemplates: TextTemplate[]
}

/**
 * The quote builder, everything on one page as in the client's design: the top bar, the
 * introduction, the product families with their lines, and the closing. The whole version is
 * edited here and saved as one document — as a fix of this version or as the next one.
 */
export const QuoteEditor = ({ initialDetail, families, profile, initialTemplates }: QuoteEditorProps) => {
  const t = useTranslations('quoteEditor')
  const router = useRouter()
  const { user, can } = useAuth()
  const canEdit = can('quote.edit')
  const sensors = useDragSensors()

  const [detail, setDetail] = useState(initialDetail)
  const [document, setDocument] = useState<QuoteDocument>(initialDetail.version.document)
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialDetail.version.document))
  const [viewing, setViewing] = useState<QuoteRevisionDetail | null>(null)
  const [catalog, setCatalog] = useState<Record<string, ProductFamilyDetail>>({})
  const [priceErrors, setPriceErrors] = useState<LinePriceErrors>({})
  const [pricing, setPricing] = useState<Set<string>>(new Set())
  const [templates, setTemplates] = useState(initialTemplates)
  const [notices, setNotices] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerLoadingId, setPickerLoadingId] = useState<string | null>(null)
  const [newFamilyId, setNewFamilyId] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [matrixOpen, setMatrixOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [duplicateReference, setDuplicateReference] = useState('')
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  const { quote, version, familyStatus } = detail
  const readOnly = !canEdit || viewing !== null
  const shown = viewing?.document ?? document
  const dirty = JSON.stringify(document) !== baseline
  const total = quoteTotal(shown)

  // ── Catalog families ──────────────────────────────────────────────────────
  const requested = useRef(new Set<string>())
  const ensureCatalog = useCallback(async (ids: string[]): Promise<Record<string, ProductFamilyDetail>> => {
    const missing = ids.filter((id) => !requested.current.has(id))
    missing.forEach((id) => requested.current.add(id))
    const loaded = await Promise.all(missing.map(async (id) => [id, await loadFamilyDetail(id)] as const))
    const found = Object.fromEntries(loaded.filter((entry): entry is readonly [string, ProductFamilyDetail] => entry[1] !== null))
    if (Object.keys(found).length > 0) setCatalog((current) => ({ ...current, ...found }))
    return found
  }, [])

  useEffect(() => {
    void ensureCatalog(shown.families.map((family) => family.productFamilyId).filter((id): id is string => id !== null))
  }, [shown.families, ensureCatalog])

  // ── Expired families → their newer version ────────────────────────────────
  const blockedFamilies = familyStatus.filter(
    (status) => status.status !== 'current' && document.families.some((family) => family.productFamilyId === status.productFamilyId),
  )
  const replaceable = blockedFamilies.filter((status) => status.replacement !== null)
  const unreplaceable = blockedFamilies.filter((status) => status.replacement === null)
  const blockedReason = unreplaceable.length > 0 ? t('blockedExpired', { names: unreplaceable.map((s) => s.name).join(', ') }) : null

  const switchExpired = useCallback(async () => {
    const targets = familyStatus.filter((status) => status.status !== 'current' && status.replacement)
    if (targets.length === 0) return
    const loaded = await ensureCatalog(targets.map((status) => status.replacement!.id))
    const details = { ...catalog, ...loaded }
    const messages: string[] = []
    setDocument((current) => ({
      ...current,
      families: current.families.map((family) => {
        const status = targets.find((s) => s.productFamilyId === family.productFamilyId)
        const newer = status?.replacement ? details[status.replacement.id] : undefined
        if (!status?.replacement || !newer) return family
        const switched = switchFamilyVersion(family, newer)
        messages.push(t('switchedFamily', { name: family.name, version: status.replacement.version }))
        if (switched.unmatched.length > 0) messages.push(t('switchedUnmatched', { name: family.name, items: switched.unmatched.join('; ') }))
        return switched.family
      }),
    }))
    setNotices((current) => [...current, ...messages])
  }, [familyStatus, catalog, ensureCatalog, t])

  // A draft moves onto the newer versions at once; a sent version only when asked (its edits become a new version).
  const autoSwitched = useRef(false)
  useEffect(() => {
    if (autoSwitched.current || !canEdit || version.status !== 'draft') return
    autoSwitched.current = true
    void switchExpired()
  }, [canEdit, version.status, switchExpired])

  // ── Live catalog prices ───────────────────────────────────────────────────
  const pricedKeys = useRef(new Map<string, string>())
  const hoursKeys = useRef(new Map<string, string>())
  useEffect(() => {
    for (const family of initialDetail.version.document.families) {
      if (!family.productFamilyId) continue
      for (const line of family.lines) {
        pricedKeys.current.set(line.id, catalogPricingKey(family.productFamilyId, line))
        hoursKeys.current.set(line.id, JSON.stringify([line.productLineId, line.options.map((o) => o.subCharacteristicId)]))
      }
    }
  }, [initialDetail])

  useEffect(() => {
    if (readOnly) return
    const pending = document.families.flatMap((family) =>
      family.productFamilyId
        ? family.lines
            .filter((line) => line.priceMode === 'catalog' && line.productLineId !== null)
            .filter((line) => pricedKeys.current.get(line.id) !== catalogPricingKey(family.productFamilyId!, line))
            .map((line) => ({ familyId: family.productFamilyId!, line }))
        : [],
    )
    if (pending.length === 0) return
    const timer = setTimeout(async () => {
      const keys = new Map(pending.map(({ familyId, line }) => [line.id, catalogPricingKey(familyId, line)]))
      setPricing(new Set(keys.keys()))
      try {
        // The API prices at most PRICE_LINES_BATCH lines per request.
        const batches: (typeof pending)[] = []
        for (let start = 0; start < pending.length; start += PRICE_LINES_BATCH) batches.push(pending.slice(start, start + PRICE_LINES_BATCH))
        const results = await Promise.all(
          batches.map(async (batch) => {
            const response = await fetch('/api/sales-quotes/price-lines', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lines: batch.map(({ familyId, line }) => ({
                  key: line.id,
                  productFamilyId: familyId,
                  productLineId: line.productLineId,
                  widthMm: line.widthMm,
                  heightMm: line.heightMm,
                  options: line.options.map(({ characteristicId, subCharacteristicId }) => ({ characteristicId, subCharacteristicId })),
                })),
              }),
            })
            if (!response.ok) throw new Error(await errorMessage(response, t('pricingFailed')))
            return ((await response.json()) as { lines: PricedLine[] }).lines
          }),
        )
        const priced = results.flat()
        const byKey = new Map(priced.map((result) => [result.key, result]))
        for (const [lineId, key] of keys) pricedKeys.current.set(lineId, key)
        setPriceErrors((current) => {
          const next = { ...current }
          for (const result of priced) {
            if (result.ok) delete next[result.key]
            else next[result.key] = result.error
          }
          return next
        })
        setDocument((current) => ({
          ...current,
          families: current.families.map((family) => ({
            ...family,
            lines: family.lines.map((line) => {
              const result = byKey.get(line.id)
              // Only if the line hasn't changed again (or gone manual) since it was sent.
              if (!result || !family.productFamilyId || line.priceMode !== 'catalog' || keys.get(line.id) !== catalogPricingKey(family.productFamilyId, line)) {
                return line
              }
              if (!result.ok) return { ...line, unitPrice: 0 }
              // The catalog's installation hours replace the line's when its catalog line or options change.
              const hoursKey = JSON.stringify([line.productLineId, line.options.map((o) => o.subCharacteristicId)])
              const takeHours = hoursKeys.current.get(line.id) !== hoursKey
              hoursKeys.current.set(line.id, hoursKey)
              return { ...line, unitPrice: result.unitPrice, unit: result.unit, installationHours: takeHours ? result.installationHours : line.installationHours }
            }),
          })),
        }))
      } catch (error) {
        showToast((error as Error).message || t('pricingFailed'), 'error')
      } finally {
        setPricing(new Set())
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [document, readOnly, t])

  // ── Unsaved changes ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // ── Families ──────────────────────────────────────────────────────────────
  const setFamilies = (update: (families: QuoteFamily[]) => QuoteFamily[]) => setDocument((current) => ({ ...current, families: update(current.families) }))

  const addCatalogFamily = async (familyId: string) => {
    setPickerLoadingId(familyId)
    const loaded = catalog[familyId] ?? (await loadFamilyDetail(familyId))
    setPickerLoadingId(null)
    if (!loaded) {
      showToast(t('familyLoadFailed'), 'error')
      return
    }
    setCatalog((current) => ({ ...current, [familyId]: loaded }))
    requested.current.add(familyId)
    const family = familyFromCatalog(loaded)
    setNewFamilyId(family.id)
    setFamilies((current) => [...current, family])
    setPickerOpen(false)
  }
  const addEmptyFamily = () => {
    const family = emptyFamily(t('newFamilyName'))
    setNewFamilyId(family.id)
    setFamilies((current) => [...current, family])
    setPickerOpen(false)
  }
  const duplicateFamily = (index: number) => {
    const source = document.families[index]
    const copy: QuoteFamily = {
      ...source,
      id: newLocalId('f'),
      name: t('copyOf', { name: source.name }),
      lines: source.lines.map((line) => ({ ...line, id: newLocalId('l') })),
    }
    for (const [from, to] of source.lines.map((line, i) => [line.id, copy.lines[i].id] as const)) {
      const key = pricedKeys.current.get(from)
      if (key && source.productFamilyId) pricedKeys.current.set(to, key)
      const hours = hoursKeys.current.get(from)
      if (hours) hoursKeys.current.set(to, hours)
    }
    setNewFamilyId(copy.id)
    setFamilies((current) => [...current.slice(0, index + 1), copy, ...current.slice(index + 1)])
  }

  // ── Saved texts ───────────────────────────────────────────────────────────
  const saveTemplate = useCallback(
    async (html: string) => {
      const name = window.prompt(t('templateNamePrompt'))?.trim()
      if (!name) return
      const response = await fetch('/api/company/text-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, html }),
      })
      if (!response.ok) {
        showToast(await errorMessage(response, t('templateSaveFailed')), 'error')
        return
      }
      const created = (await response.json()) as TextTemplate
      setTemplates((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)))
      showToast(t('templateSaved', { name }))
    },
    [t],
  )

  // ── Saving, status, versions ──────────────────────────────────────────────
  const applyDetail = (next: SalesQuoteDetailResponse) => {
    setDetail(next)
    setDocument(next.version.document)
    setBaseline(JSON.stringify(next.version.document))
    const url = new URL(window.location.href)
    url.searchParams.set('version', String(next.version.version))
    url.searchParams.set('alternative', String(next.version.alternative))
    window.history.replaceState(null, '', url)
  }

  const variantCode = quoteVariantCode(version.version, version.alternative)

  const save = async (mode: 'update' | 'newVersion') => {
    setSaving(true)
    setSaveError(null)
    try {
      const response = await fetch(`/api/sales-quotes/${quote.id}/versions/${version.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document, mode, baseRevision: version.revision }),
      })
      if (!response.ok) {
        setSaveError(await errorMessage(response, t('saveFailed')))
        return
      }
      const next = (await response.json()) as SalesQuoteDetailResponse
      applyDetail(next)
      setNotices([])
      setSaveOpen(false)
      const savedCode = quoteVariantCode(next.version.version, next.version.alternative)
      showToast(mode === 'update' ? t('savedRevision', { version: savedCode }) : t('savedNewVersion', { version: savedCode }))
    } catch {
      setSaveError(t('saveFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (status: QuoteStatus) => {
    const response = await fetch(`/api/sales-quotes/${quote.id}/versions/${version.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) {
      showToast(await errorMessage(response, t('statusFailed')), 'error')
      return
    }
    applyDetail((await response.json()) as SalesQuoteDetailResponse)
    showToast(t('statusChanged'))
  }

  const selectVariant = (nextVersion: number, nextAlternative: number) => {
    if (nextVersion === version.version && nextAlternative === version.alternative) return
    if (dirty && !window.confirm(t('discardChanges'))) return
    const url = new URL(window.location.href)
    url.searchParams.set('version', String(nextVersion))
    url.searchParams.set('alternative', String(nextAlternative))
    window.location.assign(url)
  }

  const createAlternative = async () => {
    setActionBusy('alternative')
    try {
      const response = await fetch(`/api/sales-quotes/${quote.id}/versions/${version.id}/alternatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document }),
      })
      if (!response.ok) {
        showToast(await errorMessage(response, t('alternativeFailed')), 'error')
        return
      }
      const next = (await response.json()) as SalesQuoteDetailResponse
      applyDetail(next)
      showToast(t('alternativeCreated', { code: quoteVariantCode(next.version.version, next.version.alternative) }))
    } catch {
      showToast(t('alternativeFailed'), 'error')
    } finally {
      setActionBusy(null)
    }
  }

  const promoteVariant = async (variant: QuoteVariantRef) => {
    if (dirty && !window.confirm(t('discardChanges'))) return
    setActionBusy(variant.id)
    try {
      const response = await fetch(`/api/sales-quotes/${quote.id}/versions/${variant.id}/promote`, { method: 'POST' })
      if (!response.ok) {
        showToast(await errorMessage(response, t('promoteFailed')), 'error')
        return
      }
      const next = (await response.json()) as SalesQuoteDetailResponse
      applyDetail(next)
      setMatrixOpen(false)
      showToast(t('savedNewVersion', { version: quoteVariantCode(next.version.version, next.version.alternative) }))
    } catch {
      showToast(t('promoteFailed'), 'error')
    } finally {
      setActionBusy(null)
    }
  }

  const toggleFavorite = async (variant: QuoteVariantRef = version) => {
    setActionBusy(variant.id)
    try {
      const response = await fetch(`/api/sales-quotes/${quote.id}/versions/${variant.id}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !variant.isFavorite }),
      })
      if (!response.ok) {
        showToast(await errorMessage(response, t('favoriteFailed')), 'error')
        return
      }
      applyDetail((await response.json()) as SalesQuoteDetailResponse)
    } catch {
      showToast(t('favoriteFailed'), 'error')
    } finally {
      setActionBusy(null)
    }
  }

  const markFinal = async () => {
    setActionBusy('final')
    try {
      const response = await fetch(`/api/sales-quotes/${quote.id}/versions/${version.id}/final`, { method: 'POST' })
      if (!response.ok) {
        showToast(await errorMessage(response, t('finalFailed')), 'error')
        return
      }
      applyDetail((await response.json()) as SalesQuoteDetailResponse)
      showToast(t('markedFinal', { code: variantCode }))
    } catch {
      showToast(t('finalFailed'), 'error')
    } finally {
      setActionBusy(null)
    }
  }

  const setLabel = async (label: string) => {
    const response = await fetch(`/api/sales-quotes/${quote.id}/versions/${version.id}/label`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label || null }),
    })
    if (!response.ok) {
      showToast(await errorMessage(response, t('labelFailed')), 'error')
      return
    }
    applyDetail((await response.json()) as SalesQuoteDetailResponse)
  }

  const openDuplicate = () => {
    if (dirty && !window.confirm(t('discardChanges'))) return
    setDuplicateReference(`${quote.reference} copy`)
    setDuplicateError(null)
    setDuplicateOpen(true)
  }

  const createDuplicate = async () => {
    const reference = duplicateReference.trim()
    if (!reference) {
      setDuplicateError(t('duplicateRequired'))
      return
    }
    setActionBusy('duplicate')
    setDuplicateError(null)
    try {
      const response = await fetch(`/api/sales-quotes/${quote.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: version.id, reference }),
      })
      const body = (await response.json().catch(() => null)) as { quote?: { id: string }; error?: string } | null
      if (!response.ok || !body?.quote) {
        setDuplicateError(body?.error ?? t('duplicateFailed'))
        return
      }
      setDuplicateOpen(false)
      router.push(`/app/quotes/${body.quote.id}`)
    } catch {
      setDuplicateError(t('duplicateFailed'))
    } finally {
      setActionBusy(null)
    }
  }

  const viewRevision = async (revision: number) => {
    const response = await fetch(`/api/sales-quotes/${quote.id}/versions/${version.id}/revisions/${revision}`)
    if (!response.ok) {
      showToast(t('historyFailed'), 'error')
      return
    }
    setViewing((await response.json()) as QuoteRevisionDetail)
    setHistoryOpen(false)
  }

  const openPreview = () => {
    const url = `/print/quotes/${quote.id}?version=${version.version}&alternative=${version.alternative}`
    if (dirty) {
      try {
        window.sessionStorage.setItem(previewStorageKey(quote.id), JSON.stringify(document))
      } catch {
        showToast(t('previewUnsavedFailed'), 'error')
      }
      window.open(`${url}&unsaved=1`, '_blank')
      return
    }
    window.open(url, '_blank')
  }

  const discountRequired = shown.families.some((family) => family.lines.some((line) => line.discountPct !== 0))
  const contextValue = useMemo(
    () => ({ readOnly, catalog, familyStatus, priceErrors, pricing, templates, saveTemplate }),
    [readOnly, catalog, familyStatus, priceErrors, pricing, templates, saveTemplate],
  )

  return (
    <Tooltip.Provider delayDuration={300}>
      <QuoteEditorProvider value={contextValue}>
        <div className="min-h-[100dvh] bg-slate-50 pb-10 font-sans">
          <QuoteTopBar
            reference={quote.reference}
            header={shown.header}
            total={total}
            printSettings={{ ...shown.printSettings, showDiscount: shown.printSettings.showDiscount || discountRequired }}
            discountRequired={discountRequired}
            salesContacts={profile?.salesContacts ?? []}
            businessUnits={profile?.businessUnits ?? []}
            currentUserId={user?.id ?? null}
            versions={detail.versions}
            version={version.version}
            alternative={version.alternative}
            label={version.label}
            isFinal={version.isFinal}
            isFavorite={version.isFavorite}
            status={version.status}
            readOnly={readOnly}
            canEdit={canEdit}
            dirty={dirty}
            saving={saving || actionBusy !== null}
            blockedReason={blockedReason}
            onHeaderChange={(header) => setDocument((current) => ({ ...current, header }))}
            onPrintSettingsChange={(printSettings) => setDocument((current) => ({ ...current, printSettings }))}
            onPreview={openPreview}
            onSave={() => {
              setSaveError(null)
              setSaveOpen(true)
            }}
            onOpenHistory={() => setHistoryOpen(true)}
            onSelectVariant={selectVariant}
            onSetStatus={setStatus}
            onNewAlternative={() => void createAlternative()}
            onOpenMatrix={() => setMatrixOpen(true)}
            onDuplicate={openDuplicate}
            onMarkFinal={() => void markFinal()}
            onToggleFavorite={() => void toggleFavorite()}
            onSetLabel={(label) => void setLabel(label)}
          />

          <main className="mx-auto max-w-[1200px] px-4 md:px-6">
            <div className="mt-4 flex flex-col gap-3 pb-20">
              <Link href="/app/quotes" className="inline-flex w-fit items-center gap-1 text-[13px] text-slate-500 hover:text-brand">
                <ArrowLeft className="h-3.5 w-3.5" />
                {t('backToQuotes')}
              </Link>

              {quote.archivedAt ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
                  <Info className="h-4 w-4 flex-shrink-0" />
                  {t('archivedNotice')}
                </div>
              ) : null}

              {viewing ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-[13px] text-blue-800">
                  <Info className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">
                    {t('viewingRevision', { revision: viewing.revision, date: new Date(viewing.savedAt).toLocaleString('it-IT') })}
                  </span>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDocument(viewing.document)
                        setViewing(null)
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white hover:bg-brand-dark"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t('restoreRevision')}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setViewing(null)} className="rounded-md border border-blue-300 px-2.5 py-1 text-[12px] hover:bg-blue-100">
                    {t('backToCurrent')}
                  </button>
                </div>
              ) : null}

              {version.status !== 'draft' && !viewing ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[13px] text-slate-600">
                  <Info className="h-4 w-4 flex-shrink-0 text-brand" />
                  {t('lockedVersionNotice', { version: variantCode })}
                </div>
              ) : null}

              {unreplaceable.length > 0 && !viewing ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
                  <p className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    {t('expiredNoReplacementTitle')}
                  </p>
                  <ul className="mt-1.5 space-y-1 pl-6">
                    {unreplaceable.map((status) => (
                      <li key={status.productFamilyId}>
                        {t('expiredNoReplacement', { name: status.name, version: status.version })}{' '}
                        <Link href={`/app/product-families/${status.productFamilyId}`} className="font-medium underline">
                          {t('uploadNewVersion')}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {replaceable.length > 0 && version.status !== 'draft' && canEdit && !viewing ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{t('expiredReplaceable', { names: replaceable.map((s) => s.name).join(', ') })}</span>
                  <button
                    type="button"
                    onClick={() => void switchExpired()}
                    className="rounded-md bg-amber-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-amber-700"
                  >
                    {t('switchToNewer')}
                  </button>
                </div>
              ) : null}

              {notices.length > 0 && !viewing ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <ul className="flex-1 space-y-0.5">
                    {notices.map((notice, index) => (
                      <li key={index}>{notice}</li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => setNotices([])} className="text-[12px] underline">
                    {t('dismiss')}
                  </button>
                </div>
              ) : null}

              <QuoteIntro modules={shown.intro} onChange={(intro) => setDocument((current) => ({ ...current, intro }))} />

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => setFamilies((current) => reorderOnDrop(current, event))}>
                <SortableContext items={shown.families.map((family) => family.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-3">
                    {shown.families.map((family, index) => (
                      <SortableFamily
                        key={family.id}
                        family={family}
                        onChange={(updated) => setFamilies((current) => current.map((f) => (f.id === family.id ? updated : f)))}
                        onDelete={() => setFamilies((current) => current.filter((f) => f.id !== family.id))}
                        onDuplicate={() => duplicateFamily(index)}
                        onMove={(direction) => setFamilies((current) => moveItem(current, index, direction))}
                        canMoveUp={index > 0}
                        canMoveDown={index < shown.families.length - 1}
                        isNew={newFamilyId === family.id}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {readOnly ? null : (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex h-[36px] w-full items-center justify-center rounded-xl bg-brand px-3 text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-brand-dark md:px-4"
                  title={t('addFamilyHint')}
                >
                  <Plus className="mr-2 h-5 w-5" />
                  {t('addFamily')}
                </button>
              )}

              <QuoteClosing
                document={shown}
                onChange={(closing) => setDocument((current) => ({ ...current, closing }))}
                onFamiliesReorder={(families) => setDocument((current) => ({ ...current, families }))}
              />
            </div>
          </main>
        </div>

        <QuoteFamilyPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          families={families}
          loadingId={pickerLoadingId}
          onPick={(id) => void addCatalogFamily(id)}
          onPickEmpty={addEmptyFamily}
        />
        <QuoteSaveDialog open={saveOpen} onOpenChange={setSaveOpen} version={variantCode} status={version.status} saving={saving} error={saveError} onSave={(mode) => void save(mode)} />
        <Dialog.Root open={matrixOpen} onOpenChange={setMatrixOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
            <Dialog.Content className="fixed left-1/2 top-[8vh] z-50 w-[min(96vw,820px)] -translate-x-1/2 rounded-xl bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <Dialog.Title className="text-[15px] font-semibold text-slate-800">{t('matrix')}</Dialog.Title>
                <Dialog.Close className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={t('close')}>
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
              <Dialog.Description className="mb-3 text-[13px] text-slate-500">{t('matrixHint')}</Dialog.Description>
              <QuoteVariantMatrix
                variants={detail.versions}
                active={{ version: version.version, alternative: version.alternative }}
                canEdit={canEdit && !readOnly}
                busyId={actionBusy}
                onOpen={(variant) => {
                  setMatrixOpen(false)
                  selectVariant(variant.version, variant.alternative)
                }}
                onPromote={(variant) => void promoteVariant(variant)}
                onToggleFavorite={(variant) => void toggleFavorite(variant)}
              />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        {duplicateOpen ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-6" onClick={() => actionBusy === null && setDuplicateOpen(false)}>
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
              <p className="text-sm font-semibold text-slate-900">{t('duplicateTitle', { code: variantCode })}</p>
              <p className="mt-1 text-sm text-slate-500">{t('duplicateHint')}</p>
              <label className="mt-3 block text-[13px] text-slate-600">
                {t('fieldReference')}
                <input
                  value={duplicateReference}
                  onChange={(event) => setDuplicateReference(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand"
                />
              </label>
              {duplicateError ? <p className="mt-2 text-xs text-red-600">{duplicateError}</p> : null}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-md border border-slate-200 px-3 py-1.5 text-sm" disabled={actionBusy !== null} onClick={() => setDuplicateOpen(false)}>
                  {t('cancel')}
                </button>
                <button type="button" className="rounded-md bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={actionBusy !== null} onClick={() => void createDuplicate()}>
                  {t('duplicate')}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <QuoteHistoryPanel
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          quoteId={quote.id}
          versionId={version.id}
          revision={version.revision}
          onView={(revision) => void viewRevision(revision)}
        />
        <QuoteChat
          quoteId={quote.id}
          document={document}
          baseRevision={version.revision}
          onQuote={async (id) => {
            if (id !== quote.id) {
              router.push(`/app/quotes/${id}`)
              return
            }
            const response = await fetch(`/api/sales-quotes/${id}`)
            if (!response.ok) return
            applyDetail((await response.json()) as SalesQuoteDetailResponse)
          }}
        />
      </QuoteEditorProvider>
    </Tooltip.Provider>
  )
}
