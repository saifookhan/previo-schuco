'use client'

import { ChevronDown, ChevronUp, Copy, FileText, GitBranch, Loader2, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EUR } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { QuotePosition } from '@/types/sales-quote'

/** The version of the family a position was priced from, and a newer version that can be quoted now, if any. */
export interface PositionFamilyVersion {
  version: number
  newer?: { id: string; version: number }
}

/** What the quote builder's middle pane shows. */
export type QuoteBuilderView = { kind: 'overview' } | { kind: 'new' } | { kind: 'position'; id: string }

interface QuotePositionsNavProps {
  positions: QuotePosition[]
  total: string
  view: QuoteBuilderView
  busyPositionId: string | null
  familyVersionOf: (familyId: string) => PositionFamilyVersion | undefined
  onSelect: (view: QuoteBuilderView) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}

const actionClassName =
  'rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40'

/**
 * The quote builder's left pane, like an editor's file tree: the quote's overview, every position
 * (code, line, family, price, status) and a "new position" entry. The selected position shows
 * its reorder, duplicate and delete actions.
 */
export const QuotePositionsNav = ({
  positions,
  total,
  view,
  busyPositionId,
  familyVersionOf,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: QuotePositionsNavProps) => {
  const t = useTranslations('quotes')
  const tVersions = useTranslations('productFamilyVersions')

  return (
    <nav aria-label={t('positionsTitle')} className="flex flex-col rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => onSelect({ kind: 'overview' })}
        aria-current={view.kind === 'overview' ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2 rounded-t-xl border-b border-slate-100 px-3 py-2.5 text-left text-sm font-medium transition-colors',
          view.kind === 'overview' ? 'bg-brand/5 text-brand' : 'text-slate-700 hover:bg-slate-50',
        )}
      >
        <FileText className="h-4 w-4 flex-shrink-0" />
        {t('overview')}
      </button>

      <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {t('positionsTitle')} · {positions.length}
      </p>
      <ul className="flex flex-col gap-0.5 px-1.5">
        {positions.map((position, index) => {
          const selected = view.kind === 'position' && view.id === position.id
          const busy = busyPositionId === position.id
          const newer = familyVersionOf(position.productFamilyId)?.newer
          return (
            <li
              key={position.id}
              className={cn('rounded-lg transition-colors', selected ? 'bg-brand/5 ring-1 ring-brand/30' : 'hover:bg-slate-50')}
            >
              <button
                type="button"
                onClick={() => onSelect({ kind: 'position', id: position.id })}
                aria-current={selected ? 'page' : undefined}
                className="flex w-full items-start gap-2 px-2 py-2 text-left"
              >
                <span
                  title={position.isValid ? t('validHint') : t('invalidHint')}
                  className={cn('mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full', position.isValid ? 'bg-green-500' : 'bg-red-500')}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[11px] text-slate-400">{position.positionCode}</span>
                    <span className="font-mono text-xs font-semibold tabular-nums text-brand">
                      {EUR.format(Number(position.finalPrice))}
                    </span>
                  </span>
                  <span className={cn('block truncate text-[13px] font-medium', selected ? 'text-slate-900' : 'text-slate-700')}>
                    {position.productLineName}
                  </span>
                  <span className="flex items-center gap-1 truncate text-[11px] text-slate-400">
                    {newer ? (
                      <GitBranch
                        className="h-3 w-3 flex-shrink-0 text-amber-600"
                        aria-label={tVersions('newerAvailable', { version: newer.version })}
                      />
                    ) : null}
                    <span className="truncate">{position.productFamilyName}</span>
                  </span>
                </span>
              </button>
              {selected ? (
                <div className="flex items-center justify-end gap-0.5 border-t border-brand/10 px-1.5 py-1">
                  <button
                    type="button"
                    disabled={index === 0 || busy}
                    onClick={() => onMoveUp(position.id)}
                    className={actionClassName}
                    aria-label={t('moveUp')}
                    title={t('moveUp')}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === positions.length - 1 || busy}
                    onClick={() => onMoveDown(position.id)}
                    className={actionClassName}
                    aria-label={t('moveDown')}
                    title={t('moveDown')}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDuplicate(position.id)}
                    className={actionClassName}
                    aria-label={t('duplicatePosition')}
                    title={t('duplicatePosition')}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDelete(position.id)}
                    className={cn(actionClassName, 'hover:bg-red-50 hover:text-red-600')}
                    aria-label={t('removePosition')}
                    title={t('removePosition')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {positions.length === 0 ? <p className="px-3 py-2 text-xs text-slate-400">{t('noPositions')}</p> : null}

      <div className="p-1.5">
        <button
          type="button"
          onClick={() => onSelect({ kind: 'new' })}
          aria-current={view.kind === 'new' ? 'page' : undefined}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm font-medium transition-colors',
            view.kind === 'new'
              ? 'border-brand bg-brand/5 text-brand'
              : 'border-slate-300 text-slate-600 hover:border-brand hover:text-brand',
          )}
        >
          <Plus className="h-4 w-4" />
          {t('newPosition')}
        </button>
      </div>

      <div className="mt-auto flex items-baseline justify-between gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50/70 px-3 py-2.5">
        <span className="text-xs font-medium text-slate-500">{t('total')}</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-brand">{EUR.format(Number(total))}</span>
      </div>
    </nav>
  )
}
