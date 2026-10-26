'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createContext, useContext, useEffect, useState, useTransition, type ReactNode, type TransitionStartFunction } from 'react'

import { cn } from '@/lib/utils'

/**
 * Loading state for a table that reloads on a user action (filter, sort, tab, page) — the
 * standard for every data table (ADR 0014). The first load of a page is the route's
 * `loading.tsx` skeleton (`TableSkeleton`); after that, the rows stay on screen under a
 * progress bar and a light overlay until the new data has arrived.
 *
 * Server-rendered tables: wrap the controls and the table in `LoadingRegionProvider`, start
 * the navigation with `useLoadingTransition().startTransition(() => router.push(...))` (or use
 * `PendingLink`), and wrap the table in `LoadingRegion`. Client-fetched tables pass `pending`.
 */

interface LoadingRegionContextValue {
  isPending: boolean
  startTransition: TransitionStartFunction
}

const LoadingRegionContext = createContext<LoadingRegionContextValue | null>(null)

/** Shares one transition between the controls that reload a table and the table itself. */
export const LoadingRegionProvider = ({ children }: { children: ReactNode }) => {
  const [isPending, startTransition] = useTransition()
  return <LoadingRegionContext.Provider value={{ isPending, startTransition }}>{children}</LoadingRegionContext.Provider>
}

/** The surrounding region's transition, or a local one when used outside a `LoadingRegionProvider`. */
export const useLoadingTransition = (): LoadingRegionContextValue => {
  const context = useContext(LoadingRegionContext)
  const [isPending, startTransition] = useTransition()
  return context ?? { isPending, startTransition }
}

/** Waits a moment before showing the overlay, so a fast reload doesn't flash it. */
const useDelayed = (active: boolean, delayMs: number) => {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!active) {
      setShown(false)
      return
    }
    const timer = setTimeout(() => setShown(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])
  return shown
}

export const LoadingRegion = ({
  children,
  pending,
  tone = 'light',
  className,
}: {
  children: ReactNode
  /** For client-fetched tables; otherwise the surrounding `LoadingRegionProvider`'s transition. */
  pending?: boolean
  /** `dark` for the admin panel. */
  tone?: 'light' | 'dark'
  className?: string
}) => {
  const t = useTranslations('loading')
  const context = useContext(LoadingRegionContext)
  const busy = pending ?? context?.isPending ?? false
  const showOverlay = useDelayed(busy, 150)

  return (
    <div className={cn('relative', className)} aria-busy={busy}>
      {busy ? (
        <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden" role="progressbar" aria-label={t('updating')}>
          <div className={cn('h-full w-2/5 animate-progress-indeterminate', tone === 'dark' ? 'bg-sky-400' : 'bg-brand')} />
        </div>
      ) : null}
      {/* `inert` keeps clicks and the keyboard off rows that are about to be replaced. */}
      <div className={cn('transition-opacity', showOverlay && 'opacity-60')} inert={busy || undefined}>
        {children}
      </div>
      {/* Always mounted, so screen readers announce when a reload starts. */}
      <span className="sr-only" role="status">
        {busy ? t('updating') : ''}
      </span>
      {showOverlay ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-16">
          <span
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm',
              tone === 'dark' ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-600 ring-1 ring-slate-200',
            )}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('updating')}
          </span>
        </div>
      ) : null}
    </div>
  )
}
