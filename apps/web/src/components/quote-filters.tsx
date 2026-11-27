'use client'

import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useLoadingTransition } from '@/components/ui/loading-region'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { quoteListFiltersToParams, type QuoteListFilters, type QuoteStatus } from '@schuco/contracts'

const SELECT_CLASS = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand'

const STATUSES: QuoteStatus[] = ['draft', 'invoiced', 'accepted']

/** Search, status and the archived checkbox. Archived is off until the URL says otherwise. */
export const QuoteFiltersBar = ({ filters: fromUrl }: { filters: QuoteListFilters }) => {
  const t = useTranslations('quotes')
  const ts = useTranslations('quotes.statusValue')
  const router = useRouter()
  const { isPending: pending, startTransition } = useLoadingTransition()
  const [filters, setFilters] = useState(fromUrl)
  const [q, setQ] = useState(fromUrl.q)
  const awaitedKey = useRef<string | null>(null)
  const urlKey = quoteListFiltersToParams(fromUrl).toString()

  useEffect(() => {
    if (awaitedKey.current !== null && urlKey !== awaitedKey.current) return
    awaitedKey.current = null
    setFilters(fromUrl)
    setQ((typed) => (typed.trim() === fromUrl.q ? typed : fromUrl.q))
  }, [urlKey, fromUrl])

  const apply = (next: QuoteListFilters, history: 'push' | 'replace' = 'push') => {
    setFilters(next)
    const params = quoteListFiltersToParams(next)
    if (params.toString() === urlKey) return
    awaitedKey.current = params.toString()
    const query = params.toString()
    const href = `/app/quotes${query ? `?${query}` : ''}`
    startTransition(() => (history === 'push' ? router.push(href, { scroll: false }) : router.replace(href, { scroll: false })))
  }

  const latest = useRef(filters)
  latest.current = filters
  useEffect(() => {
    if (q.trim() === filters.q) return
    const timer = setTimeout(() => apply({ ...latest.current, q: q.trim() }, latest.current.q ? 'replace' : 'push'), 300)
    return () => clearTimeout(timer)
  }, [q])

  return (
    <div className={cn('mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end', pending && 'opacity-70')}>
      <div className="space-y-1">
        <Label htmlFor="quote-filter-q" className="text-xs text-slate-500">{t('search')}</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input id="quote-filter-q" type="search" className="h-9 pl-8" placeholder={t('searchPlaceholder')} value={q} maxLength={200} onChange={(event) => setQ(event.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="quote-filter-status" className="text-xs text-slate-500">{t('status')}</Label>
        <select
          id="quote-filter-status"
          className={SELECT_CLASS}
          value={filters.status}
          onChange={(event) => apply({ ...filters, status: event.target.value as QuoteListFilters['status'] })}
        >
          <option value="">{t('allStatuses')}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>{ts(status)}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-4 pb-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 accent-brand"
            checked={filters.favorites}
            onChange={(event) => apply({ ...filters, favorites: event.target.checked })}
          />
          {t('favorites')}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 accent-brand"
            checked={filters.archived}
            onChange={(event) => apply({ ...filters, archived: event.target.checked })}
          />
          {t('archived')}
        </label>
      </div>
    </div>
  )
}
