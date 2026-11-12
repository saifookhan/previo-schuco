'use client'

import { GitCompareArrows } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { FamilyChangeTree, sideLabels } from '@/components/family-change-tree'
import { FamilyVersionGraph } from '@/components/family-version-graph'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FamilyVersionComparison, FamilyVersionsResponse } from '@schuco/contracts'

/** Which lane of the graph a family is in: its own chain, the original it was copied from, or a copy. */
const laneOf = (graph: Omit<FamilyVersionsResponse, 'steps'>, id: string) =>
  graph.versions.some((v) => v.id === id)
    ? 'main'
    : graph.origin?.id === id
      ? 'origin'
      : `branch-${graph.branches.findIndex((b) => b.versions.some((v) => v.id === id))}`

/** Ids of everything in the graph the base can be compared with. */
const graphIds = (graph: Omit<FamilyVersionsResponse, 'steps'>) => [
  ...graph.versions.map((v) => v.id),
  ...graph.branches.flatMap((b) => b.versions.map((v) => v.id)),
  ...(graph.origin ? [graph.origin.id] : []),
]

/**
 * The family's version graph (its versions, the copies made from it, the family it was copied
 * from), and what changed between the version being viewed (the base) and any other one, as a
 * `FamilyChangeTree`.
 */
export const ProductFamilyVersions = ({
  familyId,
  graph,
  initialCompareId,
  today,
}: {
  familyId: string
  graph: Omit<FamilyVersionsResponse, 'steps'>
  /** From the page address (`?compare=`), e.g. the quote builder's "See changes" link. */
  initialCompareId?: string
  today: string
}) => {
  const t = useTranslations('productFamilyVersions')
  const [compareId, setCompareId] = useState<string>(() => {
    if (initialCompareId && initialCompareId !== familyId && graphIds(graph).includes(initialCompareId)) return initialCompareId
    // Otherwise the version before the base, else the one after it, else where it was copied from, else a copy.
    const { versions } = graph
    const baseIndex = versions.findIndex((v) => v.id === familyId)
    return (versions[baseIndex - 1] ?? versions[baseIndex + 1] ?? graph.origin ?? graph.branches[0]?.versions[0])?.id ?? ''
  })
  const [comparison, setComparison] = useState<FamilyVersionComparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [steps, setSteps] = useState<FamilyVersionsResponse['steps']>([])
  const latestRequest = useRef(0)

  // The graph's change counts compare every version, so they come after the page.
  useEffect(() => {
    let current = true
    fetch(`/api/product-families/${familyId}/versions?steps=true`, { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<FamilyVersionsResponse>) : null))
      .then((result) => current && result && setSteps(result.steps))
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [familyId])

  useEffect(() => {
    if (!compareId) return
    const requestNumber = ++latestRequest.current
    const isCurrent = () => requestNumber === latestRequest.current
    setLoading(true)
    setError(false)
    fetch(`/api/product-families/${familyId}/compare/${compareId}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!isCurrent()) return
        if (!response.ok) throw new Error(String(response.status))
        const result = (await response.json()) as FamilyVersionComparison
        if (!isCurrent()) return
        setComparison(result)
      })
      .catch(() => isCurrent() && setError(true))
      .finally(() => isCurrent() && setLoading(false))
  }, [familyId, compareId])

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-slate-500" />
          {t('title')}
        </CardTitle>
        <p className="text-sm text-slate-500">{t('subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Git graph: every version and copy, the change counts along each edge; pick what to compare with. */}
        <FamilyVersionGraph graph={graph} steps={steps} baseId={familyId} compareId={compareId} today={today} onPick={setCompareId} />

        <FamilyChangeTree comparison={comparison} labels={comparison ? sideLabels(comparison, laneOf(graph, comparison.from.id) === laneOf(graph, comparison.to.id)) : null} loading={loading} error={error} />
      </CardContent>
    </Card>
  )
}
