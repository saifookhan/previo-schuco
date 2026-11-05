'use client'

import { useFormatter, useTranslations } from 'next-intl'
import type { KeyboardEvent } from 'react'

import { KIND_COLOR, KIND_GLYPH } from '@/components/family-change-kinds'
import { FAMILY_CHANGE_KINDS, priceValidityStatus, type FamilyVersionSummary, type FamilyVersionsResponse } from '@schuco/contracts'

/**
 * Lane colours: the family being viewed in the brand colour, its first two copies in the next
 * categorical hues; further copies and the family it was copied from in neutral grey. Every lane
 * is also labelled with the family's name, so the colour is never the only cue.
 */
const MAIN_LANE = 'var(--color-brand)'
const BRANCH_LANES = ['#d55181', '#8a63d2']
const NEUTRAL_LANE = '#94a3b8'

const COLUMN = 150
const LANE_HEIGHT = 104
const PAD_X = 80
const PAD_TOP = 34

type Lane = { key: string; name: string; color: string; versions: FamilyVersionSummary[] }
type Point = { x: number; y: number; lane: Lane; version: FamilyVersionSummary }

const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value)

/**
 * The family's versions as a git graph: one lane for its own chain of versions, one per copy made
 * from it (forking off the version it was copied from) and one for the family it was itself
 * copied from. Columns follow creation order. Every edge carries its change counts once they have
 * loaded. Click a version to compare it with the one being viewed.
 */
export const FamilyVersionGraph = ({
  graph,
  steps,
  baseId,
  compareId,
  today,
  onPick,
}: {
  graph: Omit<FamilyVersionsResponse, 'steps'>
  steps: FamilyVersionsResponse['steps']
  baseId: string
  compareId: string
  today: string
  onPick: (id: string) => void
}) => {
  const t = useTranslations('productFamilyVersions')
  const format = useFormatter()

  const lanes: Lane[] = [
    ...(graph.origin ? [{ key: 'origin', name: graph.origin.name, color: NEUTRAL_LANE, versions: [graph.origin] }] : []),
    { key: 'main', name: graph.versions[graph.versions.length - 1]?.name ?? '', color: MAIN_LANE, versions: graph.versions },
    ...graph.branches.map((branch, i) => ({
      key: branch.versions[0]?.id ?? String(i),
      name: branch.versions[branch.versions.length - 1]?.name ?? '',
      color: BRANCH_LANES[i] ?? NEUTRAL_LANE,
      versions: branch.versions,
    })),
  ]
  const ordered = lanes.flatMap((lane) => lane.versions).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const column = new Map(ordered.map((v, i) => [v.id, i]))
  const points = new Map<string, Point>()
  lanes.forEach((lane, laneIndex) =>
    lane.versions.forEach((version) =>
      points.set(version.id, { x: PAD_X + (column.get(version.id) ?? 0) * COLUMN, y: PAD_TOP + laneIndex * LANE_HEIGHT, lane, version }),
    ),
  )

  // The API's edges (version → next version, original → copy), as drawn between the points.
  const edges = graph.edges.flatMap(({ fromId, toId }) => {
    const from = points.get(fromId)
    const to = points.get(toId)
    return from && to ? [{ from, to }] : []
  })

  const width = PAD_X * 2 + (ordered.length - 1) * COLUMN + 220
  const height = PAD_TOP + (lanes.length - 1) * LANE_HEIGHT + 70

  const onKey = (event: KeyboardEvent, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPick(id)
    }
  }

  return (
    <div className="overflow-x-auto pb-1">
      <svg width={width} height={height} role="group" aria-label={t('graphLabel')} className="block">
        {edges.map(({ from, to }) => {
          const sameLane = from.y === to.y
          const d = sameLane
            ? `M${from.x},${from.y} L${to.x},${to.y}`
            : `M${from.x},${from.y} C${from.x + COLUMN * 0.6},${from.y} ${to.x - COLUMN * 0.6},${to.y} ${to.x},${to.y}`
          const step = steps.find((s) => s.fromId === from.version.id && s.toId === to.version.id)
          const kinds = step ? FAMILY_CHANGE_KINDS.filter((kind) => step.counts[kind] > 0) : []
          // Chips sit above the middle of the edge; on a fork, above its end in the copy's lane.
          const cx = sameLane ? (from.x + to.x) / 2 : to.x - COLUMN / 2
          const cy = (sameLane ? from.y : to.y) - 16
          const chipWidth = 30
          return (
            <g key={`${from.version.id}→${to.version.id}`}>
              <path d={d} fill="none" stroke={to.lane.color} strokeWidth={2.5} strokeLinecap="round" strokeOpacity={0.7} />
              {step ? (
                kinds.length ? (
                  <g aria-label={kinds.map((kind) => `${step.counts[kind]} ${t(`kinds.${kind}`)}`).join(', ')}>
                    {kinds.map((kind, i) => {
                      const x = cx - (kinds.length * chipWidth) / 2 + i * chipWidth + 7
                      return (
                        <g key={kind} transform={`translate(${x}, ${cy})`}>
                          <circle r={6} fill={KIND_COLOR[kind]} />
                          <text textAnchor="middle" dy="0.35em" className="fill-white text-[8px] font-bold">
                            {KIND_GLYPH[kind]}
                          </text>
                          <text x={9} dy="0.35em" className="fill-slate-600 text-[11px] font-medium tabular-nums">
                            {step.counts[kind]}
                          </text>
                        </g>
                      )
                    })}
                  </g>
                ) : (
                  <text x={cx} y={cy} dy="0.35em" textAnchor="middle" className="fill-slate-400 text-[10px]">
                    {t('noChangesShort')}
                  </text>
                )
              ) : null}
            </g>
          )
        })}

        {lanes.map((lane) => {
          const first = points.get(lane.versions[0].id)!
          const copiedFrom = lane.versions[0].duplicatedFromId ? points.get(lane.versions[0].duplicatedFromId) : undefined
          return (
            <text key={lane.key} x={first.x - 12} y={first.y - 24} className="fill-slate-600 text-[11px] font-semibold">
              <title>{lane.name}</title>
              {truncate(lane.name, 34)}
              {copiedFrom ? <tspan className="fill-slate-400 font-normal">{`  ${t('copyOf', { version: copiedFrom.version.version })}`}</tspan> : null}
              {lane.key === 'origin' ? <tspan className="fill-slate-400 font-normal">{`  ${t('originLane')}`}</tspan> : null}
            </text>
          )
        })}

        {[...points.values()].map(({ x, y, lane, version }) => {
          const isBase = version.id === baseId
          const isTarget = version.id === compareId
          const status = version.isPublished ? priceValidityStatus(version, today) : 'draft'
          return (
            <g key={version.id} transform={`translate(${x}, ${y})`}>
              <g
                role="button"
                tabIndex={isBase ? -1 : 0}
                aria-pressed={isTarget}
                aria-label={isBase ? `v${version.version}, ${t('viewing')}` : t('compareWithVersion', { version: version.version })}
                className={isBase ? undefined : 'cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-slate-900'}
                onClick={() => !isBase && onPick(version.id)}
                onKeyDown={(event) => !isBase && onKey(event, version.id)}
              >
                <title>{`${version.name} v${version.version}`}</title>
                {/* Hit target bigger than the mark. */}
                <circle r={18} fill="transparent" stroke="transparent" strokeWidth={2} />
                {isTarget ? <circle r={14} fill="none" stroke={lane.color} strokeWidth={2} strokeDasharray="3 3" /> : null}
                {isBase ? <circle r={15} fill={lane.color} fillOpacity={0.15} /> : null}
                {/* A draft is drawn hollow. */}
                <circle
                  r={isBase ? 10 : 8}
                  fill={status === 'draft' ? 'white' : lane.color}
                  stroke={lane.color}
                  strokeWidth={2.5}
                />
              </g>
              <text y={30} textAnchor="middle" className="fill-slate-800 text-[12px] font-bold">
                v{version.version}
              </text>
              <text y={44} textAnchor="middle" className="fill-slate-500 text-[10px]">
                {`${t(`status.${status}`)} · ${format.dateTime(new Date(version.createdAt), { dateStyle: 'medium' })}`}
              </text>
              {isBase ? (
                <text y={58} textAnchor="middle" className="fill-brand text-[10px] font-semibold">
                  {t('viewing')}
                </text>
              ) : (
                // A real link: new tab, copy link and middle-click work.
                <a href={`/app/product-families/${version.id}`} className="group outline-none">
                  <text
                    y={58}
                    textAnchor="middle"
                    className="fill-slate-400 text-[10px] group-hover:fill-brand group-hover:underline group-focus-visible:fill-brand group-focus-visible:underline"
                  >
                    {t('open')}
                  </text>
                </a>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
