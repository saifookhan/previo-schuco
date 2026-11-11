'use client'

import { ChevronDown, ChevronUp, Copy, GitBranch, Loader2, Pencil, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { FamilyVersionChanges } from '@/components/family-version-changes'
import { cn } from '@/lib/utils'
import type { QuotePosition } from '@/types/sales-quote'

const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

/** The version of the family a position was priced from, and a newer version that can be quoted now, if any. */
export interface PositionFamilyVersion {
  version: number
  newer?: { id: string; version: number }
}

interface QuotePositionCardProps {
  position: QuotePosition
  familyVersion?: PositionFamilyVersion
  isFirst: boolean
  isLast: boolean
  busy: boolean
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onEdit: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}

/**
 * One quote position as a sortable card — matches the reference PREVIO
 * preventivo layout (up/down reorder, validity badge, copy/delete,
 * expand for detail) instead of a plain table row.
 */
export const QuotePositionCard = ({
  position,
  familyVersion,
  isFirst,
  isLast,
  busy,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDuplicate,
  onDelete,
}: QuotePositionCardProps) => {
  const t = useTranslations('quotes')
  const tVersions = useTranslations('productFamilyVersions')
  const [expanded, setExpanded] = useState(false)
  const [showNewer, setShowNewer] = useState(false)
  const newer = familyVersion?.newer

  return (
    <div className="overflow-hidden rounded-xl border-l-4 border-l-brand bg-white shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex flex-shrink-0 flex-col text-slate-600">
            <button
              type="button"
              disabled={isFirst || busy}
              onClick={() => onMoveUp(position.id)}
              className={cn(
                'rounded p-0.5',
                isFirst || busy ? 'cursor-not-allowed text-slate-300' : 'text-slate-600 hover:bg-slate-100',
              )}
              aria-label={t('moveUp')}
              title={t('moveUp')}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={isLast || busy}
              onClick={() => onMoveDown(position.id)}
              className={cn(
                'rounded p-0.5',
                isLast || busy ? 'cursor-not-allowed text-slate-300' : 'text-slate-600 hover:bg-slate-100',
              )}
              aria-label={t('moveDown')}
              title={t('moveDown')}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          <span className="flex-shrink-0 font-mono text-xs text-slate-400">{position.positionCode}</span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-slate-900">{position.productLineName}</p>
            <p className="truncate text-xs text-slate-400">
              {familyVersion ? t('familyOption', { name: position.productFamilyName, version: familyVersion.version }) : position.productFamilyName}
            </p>
          </div>

          {newer ? (
            <button
              type="button"
              onClick={() => setShowNewer((open) => !open)}
              aria-expanded={showNewer}
              title={tVersions('newerAvailableHint')}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-200"
            >
              <GitBranch className="h-3 w-3" />
              {tVersions('newerAvailable', { version: newer.version })}
            </button>
          ) : null}

          <span
            title={position.isValid ? t('validHint') : t('invalidHint')}
            className={cn(
              'hidden flex-shrink-0 cursor-default items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium sm:inline-flex',
              position.isValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
            )}
          >
            <span
              className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', position.isValid ? 'bg-green-500' : 'bg-red-500')}
            />
            {position.isValid ? t('valid') : t('invalid')}
          </span>
        </div>

        <div className="ml-2 flex flex-shrink-0 items-center gap-1">
          <div className="mr-1 hidden text-[14px] font-bold tabular-nums text-brand sm:mr-2 sm:block">
            {EUR.format(Number(position.finalPrice))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onEdit(position.id)}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            aria-label={t('editPosition')}
            title={t('editPosition')}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDuplicate(position.id)}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            aria-label={t('duplicatePosition')}
            title={t('duplicatePosition')}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(position.id)}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            aria-label={t('removePosition')}
            title={t('removePosition')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md p-1 text-slate-600 transition-colors hover:bg-slate-100"
            aria-label={t('expand')}
          >
            <ChevronDown className={cn('h-5 w-5 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {newer && showNewer ? (
        <div className="space-y-1 border-b border-amber-100 bg-amber-50/60 px-4 py-2">
          <p className="text-xs text-amber-800">{tVersions('newerAvailableHint')}</p>
          <FamilyVersionChanges familyId={newer.id} fromId={position.productFamilyId} />
        </div>
      ) : null}

      {expanded ? (
        <div className="space-y-2 px-4 py-3 text-sm text-slate-600">
          <p className="sm:hidden">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                position.isValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
              )}
            >
              {position.isValid ? t('valid') : t('invalid')}
            </span>
          </p>
          {position.description ? <p>{position.description}</p> : null}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <span>
              {t('columnDims')}: {Math.round(Number(position.widthMm))}×{Math.round(Number(position.heightMm))} mm
            </span>
            <span>
              {t('columnM2')}: {Number(position.totalM2).toFixed(2)}
            </span>
            <span>
              {t('columnQty')}: {position.quantity}
            </span>
            <span>
              {t('fieldDiscount')}/{t('fieldMarkup')}: {Number(position.discountPct)}% /{' '}
              {Number(position.extraMarkupPct)}%
            </span>
            {position.pricingMode === 'manual' ? (
              <span
                className="inline-flex w-fit items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
                title={t('pricingModeManualLabel')}
              >
                {t('pricingModeManual')} · {t('fieldLineValue')}
              </span>
            ) : null}
          </div>
          {position.characteristics.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {position.characteristics.map((c) => (
                <span key={c.id} className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
                  {c.characteristicName}: {c.subCharacteristicName}
                  {/* Priced at its own discount/markup, not the position's shown above. */}
                  {c.discountPct != null &&
                  c.markupPct != null &&
                  (Number(c.discountPct) !== Number(position.discountPct) || Number(c.markupPct) !== Number(position.extraMarkupPct)) ? (
                    <span className="ml-1 text-slate-400" title={t('optionOwnTermsHint')}>
                      · {Number(c.discountPct)}% / {Number(c.markupPct)}%
                    </span>
                  ) : null}
                  {c.pricingMode === 'manual' ? (
                    <span className="ml-1 font-semibold text-amber-600" title={t('pricingModeManualLabel')}>
                      ({t('pricingModeManual')})
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
          <p className="pt-1 font-mono font-semibold text-brand">{EUR.format(Number(position.finalPrice))}</p>
        </div>
      ) : null}
    </div>
  )
}
