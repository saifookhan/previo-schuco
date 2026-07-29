'use client'

import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  FileDown,
  GripVertical,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/types/quote'
import { cn } from '@/lib/utils'

interface QuoteHeaderProps {
  reference: string
  client: string
  project: string
  total: number
  locale: string
}

/**
 * Sticky quote header with reference, client info, total, and action buttons.
 */
export const QuoteHeader = ({
  reference,
  client,
  project,
  total,
  locale,
}: QuoteHeaderProps) => {
  const t = useTranslations('header')

  return (
    <div className="sticky top-0 z-30 w-full border-b bg-white/90 shadow-md backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex-shrink-0 rounded-md bg-brand px-2.5 py-1 text-[13px] font-semibold tracking-wide text-white">
            {reference}
          </span>
          <span className="hidden h-5 w-px flex-shrink-0 bg-slate-200 md:block" />
          <div className="hidden min-w-0 flex-col md:flex">
            <span className="mb-0.5 text-[11px] font-medium uppercase leading-none tracking-wider text-slate-400">
              {t('clientLabel')}
            </span>
            <span className="max-w-[220px] truncate text-[14px] font-semibold text-slate-800">
              {client}
            </span>
          </div>
          <span className="hidden h-5 w-px flex-shrink-0 bg-slate-200 lg:block" />
          <div className="hidden min-w-0 flex-col lg:flex">
            <span className="mb-0.5 text-[11px] font-medium uppercase leading-none tracking-wider text-slate-400">
              {t('projectLabel')}
            </span>
            <span className="max-w-[260px] truncate text-[14px] font-medium text-slate-600">
              {project}
            </span>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-4">
          <div className="flex flex-col items-end">
            <div className="font-mono text-[22px] font-bold tabular-nums leading-none text-brand md:text-[28px]">
              {formatCurrency(total, locale)}
            </div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {t('totalLabel')}
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <Button variant="icon" size="icon" title={t('printSettings')} aria-label={t('printSettings')}>
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
            <Button variant="icon" size="icon" title={t('preview')} aria-label={t('preview')}>
              <Eye className="h-4 w-4" />
            </Button>
            <button
              disabled
              className="cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 p-2 text-slate-400"
              title={t('export')}
              aria-label={t('export')}
            >
              <FileDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
