'use client'

import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { formatCurrency, type ProductFamily } from '@/types/quote'
import { cn } from '@/lib/utils'

interface ProductFamilyCardProps {
  family: ProductFamily
  locale: string
  isFirst: boolean
  isLast: boolean
  onUpdate: (id: string, updates: Partial<ProductFamily>) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
}

/**
 * Product family row card matching the PREVIO preventivo demo.
 */
export const ProductFamilyCard = ({
  family,
  locale,
  isFirst,
  isLast,
  onUpdate,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: ProductFamilyCardProps) => {
  const t = useTranslations('family')
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="overflow-hidden rounded-xl border-l-4 border-l-brand bg-white shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="relative z-10 flex items-center justify-between border-b border-slate-300 bg-white px-3 py-1.5 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex flex-shrink-0 items-center text-slate-600">
            <div
              className="cursor-grab touch-none p-0.5 active:cursor-grabbing"
              aria-label={t('drag')}
              title={t('drag')}
            >
              <GripVertical className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <button
                disabled={isFirst}
                onClick={() => onMoveUp(family.id)}
                className={cn(
                  'rounded p-0.5',
                  isFirst ? 'cursor-not-allowed text-slate-300' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                disabled={isLast}
                onClick={() => onMoveDown(family.id)}
                className={cn(
                  'rounded p-0.5',
                  isLast ? 'cursor-not-allowed text-slate-300' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <input
            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-0.5 text-[16px] font-semibold text-slate-900 outline-none transition-colors hover:border-slate-200 focus:border-brand focus:ring-1 focus:ring-brand"
            placeholder={t('placeholder')}
            type="text"
            value={family.name}
            onChange={(e) => onUpdate(family.id, { name: e.target.value })}
          />

          <span
            title={family.isValid ? t('valid') : family.validityNote ?? t('invalid')}
            className={cn(
              'hidden flex-shrink-0 cursor-default items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium sm:inline-flex',
              family.isValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 flex-shrink-0 rounded-full',
                family.isValid ? 'bg-green-500' : 'bg-red-500',
              )}
            />
            {family.isValid ? t('valid') : t('invalid')}
          </span>

          <button
            onClick={() => onUpdate(family.id, { isAlternative: !family.isAlternative })}
            className={cn(
              'flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors',
              family.isAlternative
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200',
            )}
            title={t('markAlternative')}
          >
            {family.isAlternative ? t('alt') : t('std')}
          </button>
        </div>

        <div className="ml-2 flex flex-shrink-0 items-center gap-1">
          <div className="mr-1 hidden font-bold tabular-nums text-brand sm:mr-2 sm:block text-[14px]">
            {formatCurrency(family.total, locale)}
          </div>
          <button
            onClick={() => onDuplicate(family.id)}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            aria-label={t('duplicate')}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(family.id)}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
            aria-label={t('delete')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-md p-1 text-slate-600 transition-colors hover:bg-slate-100"
            aria-label={t('expand')}
          >
            <ChevronDown className={cn('h-5 w-5 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-3 text-sm text-slate-500">
          <p>Schüco {family.name}</p>
          <p className="mt-1 font-mono text-brand">{formatCurrency(family.total, locale)}</p>
        </div>
      )}
    </div>
  )
}
