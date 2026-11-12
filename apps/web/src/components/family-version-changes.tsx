'use client'

import { ArrowUpRight, ChevronDown, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { ChangeCountChips, totalChanges } from '@/components/family-change-kinds'
import { FamilyChangeTree, sideLabels } from '@/components/family-change-tree'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import type { FamilyVersionComparison, FamilyVersionsResponse } from '@schuco/contracts'

/**
 * For the quote builder: what changed in a family version compared with another one (by default
 * the version before it), as change-kind chips that open the full change tree below them, with a
 * link to the comparison on the family's page. Shows nothing if the versions can't be loaded.
 */
export const FamilyVersionChanges = ({
  familyId,
  fromId,
  defaultOpen = false,
  className,
}: {
  familyId: string
  fromId?: string
  /** Show the tree right away instead of behind the "Show changes" button. */
  defaultOpen?: boolean
  className?: string
}) => {
  const t = useTranslations('productFamilyVersions')
  const [open, setOpen] = useState(defaultOpen)
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'first' }
    | { status: 'hidden' }
    | { status: 'ok'; comparison: FamilyVersionComparison; fromOriginal: boolean }
  >({
    status: 'loading',
  })

  useEffect(() => {
    let current = true
    const load = async () => {
      let previousId = fromId
      let fromOriginal = false
      if (!previousId) {
        // Only the chain and the original are needed, not the copies.
        const response = await fetch(`/api/product-families/${familyId}/versions?graph=false`, { cache: 'no-store' })
        if (!response.ok) return { status: 'hidden' as const }
        const { versions, origin } = (await response.json()) as FamilyVersionsResponse
        const index = versions.findIndex((v) => v.id === familyId)
        // The version before; for the first version of a copy, the family it was copied from.
        fromOriginal = index === 0 && Boolean(origin)
        previousId = versions[index - 1]?.id ?? (index === 0 ? origin?.id : undefined)
        if (!previousId) return { status: 'first' as const }
      }
      const response = await fetch(`/api/product-families/${familyId}/compare/${previousId}`, { cache: 'no-store' })
      if (!response.ok) return { status: 'hidden' as const }
      return { status: 'ok' as const, comparison: (await response.json()) as FamilyVersionComparison, fromOriginal }
    }
    load()
      .then((next) => current && setState(next))
      .catch(() => current && setState({ status: 'hidden' }))
    return () => {
      current = false
    }
  }, [familyId, fromId])

  if (state.status === 'hidden') return null
  if (state.status === 'loading') {
    return (
      <p className={cn('flex items-center gap-1.5 text-xs text-slate-400', className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('loading')}
      </p>
    )
  }
  if (state.status === 'first') return <p className={cn('text-xs text-slate-400', className)}>{t('firstVersion')}</p>

  const { comparison, fromOriginal } = state
  const { from, to, counts } = comparison
  const hasChanges = totalChanges(counts) > 0
  // The comparison is always older → newer; the link opens the newer one compared with the older.
  return (
    <div className={cn('space-y-2', className)}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span>
          {fromOriginal
            ? t('changesFromOriginal', { name: from.name, from: from.version })
            : t('changesBetween', { from: from.version, to: to.version })}
        </span>
        <ChangeCountChips counts={counts} />
        {hasChanges ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-0.5 text-brand underline-offset-2 hover:underline"
          >
            {open ? t('hideChanges') : t('showChanges')}
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
          </button>
        ) : null}
        <Link
          href={`/app/product-families/${to.id}?compare=${from.id}`}
          target="_blank"
          className="inline-flex items-center gap-0.5 text-brand underline-offset-2 hover:underline"
        >
          {t('familyPage')}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </p>
      {open && hasChanges ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <FamilyChangeTree comparison={comparison} labels={sideLabels(comparison, !fromOriginal)} loading={false} error={false} />
        </div>
      ) : null}
    </div>
  )
}
