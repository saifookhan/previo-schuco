'use client'

import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLoadingTransition } from '@/components/ui/loading-region'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import {
  activeProductFamilyFilterCount,
  EMPTY_PRODUCT_FAMILY_FILTERS,
  PRODUCT_FAMILY_SORTS,
  PRODUCT_FAMILY_VALIDITY_FILTERS,
  productFamilyFiltersToParams,
  type ProductFamilyFilters,
} from '@schuco/contracts'

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand'

/** Filters that live under "More filters"; it opens by itself when one of them is set. */
const MORE_KEYS = ['invoicing', 'validOn', 'updatedFrom', 'updatedTo', 'latestOnly', 'owner', 'discount'] as const

/**
 * Filter bar for the product families list. Every change rewrites the URL's search params
 * (the server page filters from them), so filtered lists can be shared and Back works.
 */
export const ProductFamilyFiltersBar = ({
  filters: fromUrl,
  tab,
  categories,
  brands,
  owners,
  shown,
  total,
}: {
  filters: ProductFamilyFilters
  tab: 'own' | 'shared'
  categories: string[]
  brands: string[]
  /** Shared tab only: owning companies to pick from. */
  owners: string[]
  shown: number
  total: number
}) => {
  const t = useTranslations('productFamilyFilters')
  const router = useRouter()
  // The table below shows the reload (ADR 0014); the bar only dims a little.
  const { isPending: pending, startTransition } = useLoadingTransition()
  // What the controls show: updated on every change right away, then replaced by the URL's
  // filters once the page has re-rendered (and on Back/forward), so nothing snaps back meanwhile.
  const [filters, setFilters] = useState(fromUrl)
  const [q, setQ] = useState(fromUrl.q)
  /** Filters (as a query string) of the last navigation this bar started and is still waiting for. */
  const awaitedKey = useRef<string | null>(null)
  const urlKey = productFamilyFiltersToParams(fromUrl).toString()
  // Keyed on `urlKey` (the filters' content), not the `fromUrl` object, which is new on every render.
  useEffect(() => {
    if (awaitedKey.current !== null && urlKey !== awaitedKey.current) {
      return // an earlier change of ours landing while a newer one is on its way — keep showing the newer one
    }
    awaitedKey.current = null
    setFilters(fromUrl)
    // The URL's search text replaces the box only when it isn't what's typed there (Back, a link,
    // Clear) — so keystrokes made while a search loads, and a trailing space, are kept.
    setQ((typed) => (typed.trim() === fromUrl.q ? typed : fromUrl.q))
  }, [urlKey])
  const hasMoreFilters = MORE_KEYS.some((key) => fromUrl[key] !== EMPTY_PRODUCT_FAMILY_FILTERS[key])
  const [moreOpen, setMoreOpen] = useState(hasMoreFilters)
  // A URL with one of them set (Back, a shared link) always shows them.
  useEffect(() => {
    if (hasMoreFilters) setMoreOpen(true)
  }, [hasMoreFilters])
  const activeCount = activeProductFamilyFilterCount(filters)

  /** Each filter change is a history entry (Back undoes it); search typing replaces its own entry instead. */
  const apply = (next: ProductFamilyFilters, history: 'push' | 'replace' = 'push') => {
    setFilters(next)
    const params = productFamilyFiltersToParams(next)
    if (params.toString() === urlKey) return // already showing this — no navigation to wait for
    awaitedKey.current = params.toString()
    if (tab === 'shared') params.set('tab', 'shared')
    const query = params.toString()
    const href = `/app/product-families${query ? `?${query}` : ''}`
    startTransition(() => (history === 'push' ? router.push(href, { scroll: false }) : router.replace(href, { scroll: false })))
  }
  const set = <K extends keyof ProductFamilyFilters>(key: K, value: ProductFamilyFilters[K]) => apply({ ...filters, [key]: value })

  // Search applies while typing, after a short pause. `latest` keeps the timer from using stale filters.
  const latest = useRef(filters)
  latest.current = filters
  useEffect(() => {
    if (q.trim() === filters.q) return
    const timer = setTimeout(() => apply({ ...latest.current, q: q.trim() }, latest.current.q ? 'replace' : 'push'), 300)
    return () => clearTimeout(timer)
    // Re-runs only when the typed text changes; `apply` and the filters are read fresh via `latest`.
  }, [q])

  const select = <K extends 'category' | 'brand' | 'status' | 'validity' | 'invoicing' | 'owner' | 'discount'>(
    key: K,
    label: string,
    options: Array<{ value: string; label: string }>,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`pf-filter-${key}`} className="text-xs text-slate-500">
        {label}
      </Label>
      <select
        id={`pf-filter-${key}`}
        className={SELECT_CLASS}
        value={filters[key]}
        onChange={(e) => set(key, e.target.value as ProductFamilyFilters[K])}
      >
        <option value="">{t('all')}</option>
        {/* A value from the URL that no family has any more (old link) stays visible, so it can be undone. */}
        {filters[key] && !options.some((option) => option.value === filters[key]) ? (
          <option value={filters[key]}>{filters[key]}</option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )

  const dateInput = (key: 'validOn' | 'updatedFrom' | 'updatedTo', label: string, range?: { min?: string; max?: string }) => (
    <div className="space-y-1">
      <Label htmlFor={`pf-filter-${key}`} className="text-xs text-slate-500">
        {label}
      </Label>
      <Input
        id={`pf-filter-${key}`}
        type="date"
        className="h-9"
        min={range?.min || undefined}
        max={range?.max || undefined}
        value={filters[key]}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  )

  return (
    <div className={cn('mb-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 transition-opacity', pending && 'opacity-70')}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="pf-filter-q" className="text-xs text-slate-500">
            {t('search')}
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="pf-filter-q"
              type="search"
              className="h-9 pl-8"
              placeholder={t('searchPlaceholder')}
              value={q}
              maxLength={200}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        {select('category', t('category'), categories.map((value) => ({ value, label: value })))}
        {select('brand', t('brand'), brands.map((value) => ({ value, label: value })))}
        {select('status', t('status'), [
          { value: 'published', label: t('statusPublished') },
          { value: 'draft', label: t('statusDraft') },
        ])}
        {select(
          'validity',
          t('validity'),
          PRODUCT_FAMILY_VALIDITY_FILTERS.map((value) => ({ value, label: t(`validityOptions.${value}`) })),
        )}
      </div>

      {moreOpen ? (
        <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          {select('invoicing', t('invoicing'), [
            { value: 'ready', label: t('invoicingReady') },
            { value: 'notReady', label: t('invoicingNotReady') },
          ])}
          {dateInput('validOn', t('validOn'))}
          {dateInput('updatedFrom', t('updatedFrom'), { max: filters.updatedTo })}
          {dateInput('updatedTo', t('updatedTo'), { min: filters.updatedFrom })}
          {tab === 'shared' ? select('owner', t('owner'), owners.map((value) => ({ value, label: value }))) : null}
          {tab === 'shared'
            ? select('discount', t('discount'), [
                { value: 'with', label: t('discountWith') },
                { value: 'without', label: t('discountWithout') },
              ])
            : null}
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-brand"
              checked={filters.latestOnly}
              onChange={(e) => set('latestOnly', e.target.checked)}
            />
            {t('latestOnly')}
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t('moreFilters')}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', moreOpen && 'rotate-180')} />
          </Button>
          {activeCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-slate-600"
              onClick={() => {
                setQ('')
                apply({ ...EMPTY_PRODUCT_FAMILY_FILTERS, sort: filters.sort })
              }}
            >
              <X className="h-3.5 w-3.5" />
              {t('clear', { count: activeCount })}
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500" aria-live="polite">
            {t('showing', { shown, total })}
          </p>
          <div className="flex items-center gap-2">
            <Label htmlFor="pf-filter-sort" className="whitespace-nowrap text-xs text-slate-500">
              {t('sort')}
            </Label>
            <select
              id="pf-filter-sort"
              className={cn(SELECT_CLASS, 'w-auto')}
              value={filters.sort}
              onChange={(e) => set('sort', e.target.value as ProductFamilyFilters['sort'])}
            >
              {PRODUCT_FAMILY_SORTS.map((value) => (
                <option key={value} value={value}>
                  {t(`sortOptions.${value}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
