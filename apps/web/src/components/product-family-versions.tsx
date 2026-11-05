'use client'

import { hierarchy, tree } from 'd3-hierarchy'
import { linkHorizontal } from 'd3-shape'
import { GitCompareArrows, ListTree, Loader2, Network } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import {
  FAMILY_CHANGE_KINDS,
  countFamilyChanges,
  pctChange,
  priceValidityStatus,
  type FamilyChangeCounts,
  type FamilyChangeKind,
  type FamilyChangeNode,
  type FamilyVersionComparison,
  type FamilyVersionSummary,
  type FamilyVersionsResponse,
  type PriceTableDiff,
} from '@schuco/contracts'

/** One hue per change kind (validated as a set: lightness, chroma, colour-blind separation). Every mark also carries a glyph and a label, so colour is never the only cue. */
const KIND_COLOR: Record<FamilyChangeKind, string> = {
  added: '#1baf7a',
  removed: '#e34948',
  economic: '#eda100',
  description: '#2a78d6',
}
const KIND_GLYPH: Record<FamilyChangeKind, string> = { added: '+', removed: '−', economic: '€', description: 'T' }

const ROW_HEIGHT = 30
const COLUMN_WIDTH = 210
const LEAF_LABEL_SPACE = 360
const PADDING = 16
/** Above this many changes the tree opens with items folded, so it starts readable. */
const FOLD_ABOVE = 40

type Datum = {
  key: string
  label: string
  /** Muted text after the label: a before → after summary, or "added" / "removed". */
  detail?: string
  kind?: FamilyChangeKind
  root?: boolean
  /** The change itself, for the detail panel (fields and links only). */
  change?: FamilyChangeNode
  counts?: FamilyChangeCounts
  folded?: boolean
  children?: Datum[]
}

const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value)
const total = (counts: FamilyChangeCounts) => FAMILY_CHANGE_KINDS.reduce((sum, kind) => sum + counts[kind], 0)

const KindGlyph = ({ kind, className }: { kind: FamilyChangeKind; className?: string }) => (
  <span
    aria-hidden
    className={cn('inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white', className)}
    style={{ backgroundColor: KIND_COLOR[kind] }}
  >
    {KIND_GLYPH[kind]}
  </span>
)

/**
 * The family's versions on a timeline, and what changed between the version being viewed
 * (the base) and any other one, as a tree: what changed → section → line / option → field.
 * Every change is added, removed, economic or description, and each kind can be hidden.
 */
export const ProductFamilyVersions = ({
  familyId,
  versions,
  today,
}: Pick<FamilyVersionsResponse, 'versions'> & { familyId: string; today: string }) => {
  const t = useTranslations('productFamilyVersions')
  const format = useFormatter()
  const baseIndex = versions.findIndex((v) => v.id === familyId)
  const [compareId, setCompareId] = useState<string>(() => (versions[baseIndex - 1] ?? versions[baseIndex + 1])?.id ?? '')
  const [comparison, setComparison] = useState<FamilyVersionComparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [shownKinds, setShownKinds] = useState<Set<FamilyChangeKind>>(() => new Set(FAMILY_CHANGE_KINDS))
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [hovered, setHovered] = useState<{ datum: Datum; x: number; y: number } | null>(null)
  const [view, setView] = useState<'tree' | 'list'>('tree')
  const [steps, setSteps] = useState<FamilyVersionsResponse['steps']>([])
  const latestRequest = useRef(0)

  // The timeline's change counts compare every version, so they come after the page.
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
    setSelectedKey(null)
    fetch(`/api/product-families/${familyId}/compare/${compareId}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!isCurrent()) return
        if (!response.ok) throw new Error(String(response.status))
        const result = (await response.json()) as FamilyVersionComparison
        if (!isCurrent()) return
        setComparison(result)
        // Fold every line and option when there is a lot to show; the sections stay open.
        const keys = new Set<string>()
        if (total(result.counts) > FOLD_ABOVE) {
          for (const section of result.changes) {
            if (section.type !== 'section') continue
            for (const item of section.children) if (item.type === 'item' && !item.kind) keys.add(item.id)
          }
        }
        setFolded(keys)
      })
      .catch(() => isCurrent() && setError(true))
      .finally(() => isCurrent() && setLoading(false))
  }, [familyId, compareId])

  const day = (value: string) => format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' })

  const fieldValue = (change: Extract<FamilyChangeNode, { type: 'field' }>, value: string | null): string => {
    if (value === null) return t('empty')
    switch (change.field) {
      case 'hasPriceList':
      case 'isApplicable':
        return value === 'true' ? t('yes') : t('no')
      case 'priceSource':
        return value === 'table' ? t('priceTableValue') : value
      case 'priceValidFrom':
      case 'priceValidTo':
        return day(value)
      case 'discountPct':
      case 'markupPct':
        return `${value}%`
      default:
        return value
    }
  }

  const percent = (value: number) => format.number(value / 100, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' })

  const priceTableSummary = (table: PriceTableDiff) => {
    let range = ''
    if (table.minPct !== null && table.maxPct !== null) {
      const [min, max] = [percent(table.minPct), percent(table.maxPct)]
      // Rounded prices make an even +5% come out as 4.98%…5.02%; one figure reads better then.
      range = min === max ? ` · ${min}` : ` · ${min} … ${max}`
    }
    return `${t('priceTableCells', { count: table.cells.length })}${range}`
  }

  const changeSummary = (change: FamilyChangeNode): string => {
    if (change.type !== 'field') return ''
    if (change.priceTable) return priceTableSummary(change.priceTable)
    return `${truncate(fieldValue(change, change.before), 28)} → ${truncate(fieldValue(change, change.after), 28)}`
  }

  /** The comparison as tree data, without the hidden kinds and with folded items closed. Null when nothing is left to show. */
  const data = useMemo<Datum | null>(() => {
    if (!comparison) return null
    const build = (node: FamilyChangeNode): Datum | null => {
      switch (node.type) {
        case 'section':
        case 'item': {
          if (node.type === 'item' && node.kind) {
            return shownKinds.has(node.kind)
              ? { key: node.id, label: node.name, detail: t(`kinds.${node.kind}`), kind: node.kind }
              : null
          }
          const children = node.children.map(build).filter((child): child is Datum => child !== null)
          if (!children.length) return null
          const counts = countFamilyChanges(node.children)
          for (const kind of FAMILY_CHANGE_KINDS) if (!shownKinds.has(kind)) counts[kind] = 0
          const isFolded = folded.has(node.id)
          return {
            key: node.id,
            label: node.type === 'section' ? t(`sections.${node.id}`) : node.name,
            counts,
            folded: isFolded,
            children: isFolded ? undefined : children,
          }
        }
        case 'field':
          return shownKinds.has(node.kind)
            ? { key: node.id, label: t(`fields.${node.field}`), detail: changeSummary(node), kind: node.kind, change: node }
            : null
        case 'link':
          return shownKinds.has(node.kind)
            ? { key: node.id, label: t(node.kind === 'added' ? 'offersNow' : 'offersNoLonger', { name: node.name }), kind: node.kind, change: node }
            : null
      }
    }
    const children = comparison.changes.map(build).filter((child): child is Datum => child !== null)
    if (!children.length) return null
    return {
      key: 'root',
      label: t('rootLabel', { from: comparison.from.version, to: comparison.to.version }),
      root: true,
      children,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t / format only change with the locale, which reloads the page.
  }, [comparison, shownKinds, folded])

  const layout = useMemo(() => {
    if (!data) return null
    const root = tree<Datum>().nodeSize([ROW_HEIGHT, COLUMN_WIDTH])(hierarchy(data))
    const nodes = root.descendants()
    const minX = Math.min(...nodes.map((n) => n.x))
    const maxX = Math.max(...nodes.map((n) => n.x))
    const maxDepth = Math.max(...nodes.map((n) => n.depth))
    return {
      nodes,
      links: root.links(),
      width: maxDepth * COLUMN_WIDTH + LEAF_LABEL_SPACE + PADDING * 2,
      height: maxX - minX + PADDING * 2 + ROW_HEIGHT,
      offsetY: PADDING + ROW_HEIGHT / 2 - minX,
    }
  }, [data])

  const linkPath = linkHorizontal<{ source: { x: number; y: number }; target: { x: number; y: number } }, { x: number; y: number }>()
    .x((point) => point.y)
    .y((point) => point.x)

  const toggleFold = (key: string) =>
    setFolded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const activate = (datum: Datum) => {
    if (datum.root) return
    // Folding moves the nodes, so a tooltip would point at the wrong one.
    setHovered(null)
    if (datum.counts) toggleFold(datum.key)
    else setSelectedKey((current) => (current === datum.key ? null : datum.key))
  }

  const onNodeKey = (event: KeyboardEvent, datum: Datum) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate(datum)
    }
  }

  const toggleKind = (kind: FamilyChangeKind) =>
    setShownKinds((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })

  const findChange = (nodes: FamilyChangeNode[], key: string): FamilyChangeNode | null => {
    for (const node of nodes) {
      if (node.id === key) return node
      if (node.type === 'section' || node.type === 'item') {
        const found = findChange(node.children, key)
        if (found) return found
      }
    }
    return null
  }
  const selected = comparison && selectedKey ? findChange(comparison.changes, selectedKey) : null

  const statusOf = (v: FamilyVersionSummary) => (v.isPublished ? priceValidityStatus(v, today) : 'draft')

  const countChips = (counts: FamilyChangeCounts) =>
    total(counts) === 0 ? (
      <span className="text-[11px] text-slate-400">{t('noChangesShort')}</span>
    ) : (
      <span className="flex flex-wrap items-center justify-center gap-1">
        {FAMILY_CHANGE_KINDS.filter((kind) => counts[kind] > 0).map((kind) => (
          <span key={kind} className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-600" title={t(`kinds.${kind}`)}>
            <KindGlyph kind={kind} className="h-3.5 w-3.5 text-[9px]" />
            {counts[kind]}
          </span>
        ))}
      </span>
    )

  const renderList = (datum: Datum) => (
    <ul className="space-y-1 border-l border-slate-200 pl-4">
      {datum.children?.map((child) => (
        <li key={child.key}>
          <button
            type="button"
            onClick={() => activate(child)}
            className={cn(
              'flex w-full items-start gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-slate-50',
              selectedKey === child.key && 'bg-slate-100',
            )}
          >
            {child.kind ? <KindGlyph kind={child.kind} className="mt-0.5" /> : <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full border border-slate-400" />}
            <span className="min-w-0">
              <span className="font-medium text-slate-800">{child.label}</span>
              {child.detail ? <span className="ml-2 break-words text-slate-500">{child.detail}</span> : null}
              {child.counts && child.folded ? <span className="ml-2 text-xs text-slate-400">{t('folded', { count: total(child.counts) })}</span> : null}
            </span>
          </button>
          {child.children ? renderList(child) : null}
        </li>
      ))}
    </ul>
  )

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
        {/* Timeline: every version, the change counts between neighbours; pick the version to compare with. */}
        <div className="overflow-x-auto pb-1">
          <ol className="flex min-w-max items-start">
            {versions.map((v, i) => {
              const isBase = v.id === familyId
              const isTarget = v.id === compareId
              const status = statusOf(v)
              return (
                <li key={v.id} className="flex items-start">
                  {i > 0 ? (
                    <div className="flex w-36 flex-col items-center gap-1 pt-3">
                      <div className="h-px w-full bg-slate-200" />
                      {/* Nothing until the counts arrive (or if they don't). */}
                      {steps[i - 1]?.toId === v.id ? countChips(steps[i - 1].counts) : null}
                    </div>
                  ) : null}
                  <div className="flex w-28 flex-col items-center gap-1 text-center">
                    <button
                      type="button"
                      disabled={isBase}
                      onClick={() => setCompareId(v.id)}
                      aria-pressed={isTarget}
                      className={cn(
                        'flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold transition',
                        isBase && 'bg-brand text-white ring-4 ring-brand/15',
                        !isBase && isTarget && 'border-2 border-dashed border-brand bg-white text-brand',
                        !isBase && !isTarget && 'border border-slate-300 bg-white text-slate-600 hover:border-brand hover:text-brand',
                      )}
                      title={isBase ? t('viewing') : t('compareWithVersion', { version: v.version })}
                    >
                      v{v.version}
                    </button>
                    <span className="text-[11px] font-medium text-slate-600">{t(`status.${status}`)}</span>
                    <span className="text-[11px] text-slate-400">{format.dateTime(new Date(v.createdAt), { dateStyle: 'medium' })}</span>
                    {isBase ? (
                      <span className="text-[11px] font-semibold text-brand">{t('viewing')}</span>
                    ) : (
                      <Link href={`/app/product-families/${v.id}`} className="text-[11px] text-slate-400 underline-offset-2 hover:text-brand hover:underline">
                        {t('open')}
                      </Link>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        {/* Filters: one chip per change kind, with its count; plus tree / list. */}
        <div className="flex flex-wrap items-center gap-2">
          {FAMILY_CHANGE_KINDS.map((kind) => {
            const on = shownKinds.has(kind)
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={on}
                onClick={() => toggleKind(kind)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                  on ? 'border-slate-300 bg-white text-slate-700 shadow-sm' : 'border-dashed border-slate-200 bg-slate-50 text-slate-400',
                )}
              >
                <KindGlyph kind={kind} className={cn(!on && 'opacity-40')} />
                {t(`kinds.${kind}`)}
                <span className="tabular-nums text-slate-400">{comparison?.counts[kind] ?? 0}</span>
              </button>
            )
          })}
          <div className="ml-auto inline-flex rounded-md border border-slate-200 p-0.5">
            {(
              [
                ['tree', Network],
                ['list', ListTree],
              ] as const
            ).map(([mode, Icon]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
                className={cn('inline-flex items-center gap-1 rounded px-2 py-1 text-xs', view === mode ? 'bg-slate-100 text-slate-800' : 'text-slate-500')}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`view.${mode}`)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loading')}
          </div>
        ) : error ? (
          <p className="py-6 text-sm text-red-600">{t('error')}</p>
        ) : !comparison ? null : !data || !layout ? (
          <p className="py-6 text-sm text-slate-500">
            {total(comparison.counts) === 0 ? t('noChanges', { from: comparison.from.version, to: comparison.to.version }) : t('allHidden')}
          </p>
        ) : view === 'list' ? (
          <div className="-ml-4">{renderList(data)}</div>
        ) : (
          <div className="relative overflow-x-auto rounded-lg border border-slate-100 bg-gradient-to-br from-slate-50 to-white">
            <svg width={layout.width} height={layout.height} role="img" aria-label={data.label} className="block">
              <g transform={`translate(${PADDING + 8}, ${layout.offsetY})`}>
                {layout.links.map((link) => {
                  const d = linkPath({ source: link.source, target: link.target }) ?? ''
                  return (
                    <path
                      key={`${link.source.data.key}→${link.target.data.key}`}
                      d={d}
                      // Animated with the nodes where the browser can transition `d`; elsewhere the attribute applies.
                      style={{ d: `path('${d}')`, transition: 'd 300ms ease' } as CSSProperties}
                      fill="none"
                      stroke={link.target.data.kind ? KIND_COLOR[link.target.data.kind] : '#cbd5e1'}
                      strokeOpacity={link.target.data.kind ? 0.45 : 1}
                      strokeWidth={1.5}
                    />
                  )
                })}
                {layout.nodes.map((node) => {
                  const datum = node.data
                  const isSelected = selectedKey === datum.key
                  const interactive = !datum.root
                  return (
                    <g
                      key={datum.key}
                      style={{ transform: `translate(${node.y}px, ${node.x}px)`, transition: 'transform 300ms ease' }}
                      className={cn(interactive && 'cursor-pointer outline-none [&:focus-visible>circle]:stroke-brand')}
                      tabIndex={interactive ? 0 : undefined}
                      role={interactive ? 'button' : undefined}
                      aria-label={[datum.label, datum.detail].filter(Boolean).join(': ')}
                      aria-expanded={datum.counts ? !datum.folded : undefined}
                      onClick={() => activate(datum)}
                      onKeyDown={(event) => onNodeKey(event, datum)}
                      onMouseEnter={() => setHovered({ datum, x: node.y, y: node.x + layout.offsetY })}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {datum.root ? (
                        <>
                          <rect x={-8} y={-13} width={Math.max(64, datum.label.length * 7.5 + 16)} height={26} rx={13} fill="var(--color-brand)" />
                          <text x={0} dy="0.35em" className="fill-white text-[12px] font-semibold">
                            {datum.label}
                          </text>
                        </>
                      ) : (
                        <>
                          {/* Hit target bigger than the mark. */}
                          <circle r={13} fill="transparent" />
                          {datum.kind ? (
                            <>
                              <circle r={isSelected ? 10 : 8} fill={KIND_COLOR[datum.kind]} stroke="white" strokeWidth={2} />
                              <text textAnchor="middle" dy="0.35em" className="pointer-events-none fill-white text-[10px] font-bold">
                                {KIND_GLYPH[datum.kind]}
                              </text>
                            </>
                          ) : (
                            <circle r={6} fill={datum.folded ? '#94a3b8' : 'white'} stroke="#94a3b8" strokeWidth={1.5} />
                          )}
                          <text
                            x={14}
                            dy="0.35em"
                            paintOrder="stroke"
                            stroke="white"
                            strokeWidth={4}
                            strokeLinejoin="round"
                            className={cn('text-[12px]', datum.counts ? 'fill-slate-700 font-semibold' : 'fill-slate-800', isSelected && 'font-semibold')}
                          >
                            {truncate(datum.label, datum.children ? 24 : 34)}
                            {datum.counts ? <tspan className="fill-slate-400 font-normal">{`  ${datum.folded ? '▸' : ''}${total(datum.counts)}`}</tspan> : null}
                            {datum.detail && !datum.children ? <tspan className="fill-slate-500 font-normal">{`  ${datum.detail}`}</tspan> : null}
                          </text>
                        </>
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>
            {hovered && !hovered.datum.root ? (
              <div
                className="pointer-events-none absolute z-10 max-w-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
                style={{ left: hovered.x + PADDING + 30, top: hovered.y + 12 }}
              >
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                  {hovered.datum.kind ? <KindGlyph kind={hovered.datum.kind} /> : null}
                  {hovered.datum.label}
                </div>
                {hovered.datum.detail ? <div className="mt-1 text-slate-500">{hovered.datum.detail}</div> : null}
                {hovered.datum.counts ? (
                  <div className="mt-1">{countChips(hovered.datum.counts)}</div>
                ) : null}
                <div className="mt-1 text-[11px] text-slate-400">{hovered.datum.counts ? t('hintFold') : t('hintDetails')}</div>
              </div>
            ) : null}
          </div>
        )}

        {/* The selected change in full: before and after, or the price table with each changed cell. */}
        {selected && selected.type === 'field' ? (
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <KindGlyph kind={selected.kind} />
              {t(`fields.${selected.field}`)}
              <span className="font-normal text-slate-500">· {t(`kinds.${selected.kind}`)}</span>
            </div>
            {selected.priceTable ? (
              <PriceTableHeatmap table={selected.priceTable} summary={priceTableSummary(selected.priceTable)} />
            ) : (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-md bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">{t('before', { version: comparison!.from.version })}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-slate-800">{fieldValue(selected, selected.before)}</dd>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">{t('after', { version: comparison!.to.version })}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-slate-800">{fieldValue(selected, selected.after)}</dd>
                </div>
              </dl>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {FAMILY_CHANGE_KINDS.map((kind) => (
            <span key={kind} className="inline-flex items-center gap-1.5">
              <KindGlyph kind={kind} />
              {t(`kindHelp.${kind}`)}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/** Diverging tint for a price change: warm for up, cool for down, deeper for bigger changes (capped at ±20%). */
const changeTint = (pct: number) => {
  const strength = 0.12 + Math.min(Math.abs(pct) / 20, 1) * 0.5
  return pct > 0 ? `rgba(235, 104, 52, ${strength})` : `rgba(42, 120, 214, ${strength})`
}

const PriceTableHeatmap = ({ table, summary }: { table: PriceTableDiff; summary: string }) => {
  const t = useTranslations('productFamilyVersions')
  const format = useFormatter()
  const cells = new Map(table.cells.map((cell) => [`${cell.width}x${cell.height}`, cell]))
  const price = (value: number) => format.number(value, { maximumFractionDigits: 2 })
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">{summary}</p>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-[11px] tabular-nums">
          <thead>
            <tr>
              <th className="px-1 text-left font-normal text-slate-400">{t('heightByWidth')}</th>
              {table.widths.map((width) => (
                <th key={width} className="px-1 font-medium text-slate-500">
                  {width}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.heights.map((height) => (
              <tr key={height}>
                <th className="px-1 text-left font-medium text-slate-500">{height}</th>
                {table.widths.map((width) => {
                  const cell = cells.get(`${width}x${height}`)
                  if (!cell) {
                    return (
                      <td key={width} className="min-w-12 rounded bg-slate-50 px-1.5 py-1 text-center text-slate-300">
                        ·
                      </td>
                    )
                  }
                  const pct = cell.before !== null && cell.after !== null && cell.before !== 0 ? pctChange(cell.before, cell.after) : null
                  const title =
                    cell.before === null
                      ? t('cellAdded', { price: price(cell.after ?? 0) })
                      : cell.after === null
                        ? t('cellRemoved', { price: price(cell.before) })
                        : `${price(cell.before)} → ${price(cell.after)}`
                  return (
                    <td
                      key={width}
                      title={`${width} × ${height}: ${title}`}
                      className={cn(
                        'min-w-12 rounded px-1.5 py-1 text-center text-slate-800',
                        cell.before === null && 'ring-1 ring-inset ring-emerald-500',
                        cell.after === null && 'bg-slate-100 text-slate-400 line-through',
                      )}
                      style={pct !== null ? { backgroundColor: changeTint(pct) } : undefined}
                    >
                      {price(cell.after ?? cell.before ?? 0)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">{t('heatmapLegend')}</p>
    </div>
  )
}
