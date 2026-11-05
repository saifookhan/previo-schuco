'use client'

import { ArrowUpRight, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { ChangeCountChips } from '@/components/family-change-kinds'
import { Link } from '@/i18n/navigation'
import type { FamilyVersionComparison, FamilyVersionsResponse } from '@schuco/contracts'

/**
 * One line for the quote builder: what changed in a family version compared with another one
 * (by default the version before it), as change-kind chips, with a link to the full comparison
 * on the family's page. Shows nothing if the versions can't be loaded.
 */
export const FamilyVersionChanges = ({ familyId, fromId }: { familyId: string; fromId?: string }) => {
  const t = useTranslations('productFamilyVersions')
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
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('loading')}
      </p>
    )
  }
  if (state.status === 'first') return <p className="text-xs text-slate-400">{t('firstVersion')}</p>

  const { from, to, counts } = state.comparison
  // The comparison is always older → newer; the link opens the newer one compared with the older.
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
      <span>
        {state.fromOriginal
          ? t('changesFromOriginal', { name: from.name, from: from.version })
          : t('changesBetween', { from: from.version, to: to.version })}
      </span>
      <ChangeCountChips counts={counts} />
      <Link
        href={`/app/product-families/${to.id}?compare=${from.id}`}
        target="_blank"
        className="inline-flex items-center gap-0.5 text-brand underline-offset-2 hover:underline"
      >
        {t('seeChanges')}
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </p>
  )
}
