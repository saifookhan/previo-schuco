'use client'

import { ChevronRight, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { DECIMAL, EUR } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ProductLine } from '@/types/product-family'
import type { PricingMode, QuotePositionPreview } from '@/types/sales-quote'

/** A percentage or hours as typed: no trailing zeros, at most 4 decimals ("12.5", not "12.5000"). */
const plain = (n: number) => String(Number(n.toFixed(4)))

const Row = ({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) => (
  <div className={cn('flex items-baseline justify-between gap-3 py-1.5 text-[13px]', className)}>
    <span className="min-w-0 text-slate-500">{label}</span>
    <span className="flex-shrink-0 font-mono tabular-nums text-slate-800">{value}</span>
  </div>
)

const Heading = ({ children }: { children: React.ReactNode }) => (
  <p className="pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 first:pt-0">{children}</p>
)

/** The form's inputs a preview was priced for. */
export interface PreviewInputs {
  line: ProductLine
  linePricingMode: PricingMode
  quantity: number
  /** "Colore: RAL 9010" by characteristic id, for the chosen options. */
  optionLabels: Record<string, string>
}

interface QuotePriceBreakdownProps {
  preview: QuotePositionPreview | null
  /** What `preview` was priced for — never the form's current state, which may be newer. */
  inputs: PreviewInputs | null
  /** Why the server couldn't price the current inputs. */
  error: string | null
  loading: boolean
  /** What to say while there's nothing to break down; defaults to asking for a family, line and size. */
  emptyMessage?: string
}

/**
 * How the position's price is built, live from the server's preview: the line's list price, its
 * discount and markup, each option at its own terms, the unit price and the total, plus a formula
 * trace that spells out each step.
 */
export const QuotePriceBreakdown = ({ preview, inputs, error, loading, emptyMessage }: QuotePriceBreakdownProps) => {
  const t = useTranslations('quotes')

  if (!preview || !inputs) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-400">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {error && !loading ? (
          <p role="alert" className="text-red-600">
            {t('calcFailed', { reason: error })}
          </p>
        ) : (
          (emptyMessage ?? t('calcEmpty'))
        )}
      </div>
    )
  }

  const { line, linePricingMode, quantity, optionLabels } = inputs
  const listPrice = preview.lineUnitPrice
  const discounted = listPrice * (1 - preview.discountPct / 100)
  const source =
    linePricingMode === 'manual'
      ? t('calcSourceManual')
      : line.pricingMatrixId
        ? t('calcSourceMatrix')
        : t('calcSourceFormula', { formula: line.formula, value: plain(Number(line.value)) })
  const unitPrice = preview.lineFinalUnitPrice + preview.characteristics.reduce((sum, c) => sum + c.finalUnitPrice, 0)
  const term = (price: number, discountPct: number, markupPct: number) =>
    `${DECIMAL.format(price)} × (1 − ${plain(discountPct)}%) × ${plain(markupPct)}%`
  const trace = [
    `${line.name} = ${term(listPrice, preview.discountPct, preview.extraMarkupPct)} = ${DECIMAL.format(preview.lineFinalUnitPrice)}`,
    ...preview.characteristics.map(
      (c) =>
        `${optionLabels[c.characteristicId] ?? ''} = ${term(c.price, c.discountPct, c.markupPct)} = ${DECIMAL.format(c.finalUnitPrice)}`,
    ),
    // With no options the unit price is just the line's, already on the first row.
    ...(preview.characteristics.length > 0
      ? [
          `${t('calcUnitPrice')} = ${[preview.lineFinalUnitPrice, ...preview.characteristics.map((c) => c.finalUnitPrice)]
            .map((n) => DECIMAL.format(n))
            .join(' + ')} = ${DECIMAL.format(unitPrice)}`,
        ]
      : []),
    `${t('total')} = ${DECIMAL.format(unitPrice)} × ${quantity} = ${DECIMAL.format(preview.finalPrice)}`,
  ].join('\n')

  return (
    <div className={cn('transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
      <Heading>{t('calcLine')}</Heading>
      <p className="truncate text-[13px] font-medium text-slate-800">{line.name}</p>
      <p className="truncate font-mono text-[11px] text-slate-400" title={source}>
        {source}
      </p>
      <div className="mt-1 divide-y divide-slate-100">
        <Row
          label={
            <>
              {t('calcListPrice')}
              {preview.lineMinApplied ? (
                <span className="ml-1 text-amber-700">· {t('calcMinApplied')}</span>
              ) : null}
            </>
          }
          value={DECIMAL.format(listPrice)}
        />
        <Row label={t('calcDiscount', { pct: plain(preview.discountPct) })} value={`− ${DECIMAL.format(listPrice - discounted)}`} />
        <Row
          label={t('calcMarkup', { pct: plain(preview.extraMarkupPct) })}
          value={`${preview.lineFinalUnitPrice >= discounted ? '+' : '−'} ${DECIMAL.format(Math.abs(preview.lineFinalUnitPrice - discounted))}`}
        />
        <Row label={t('calcLineNet')} value={DECIMAL.format(preview.lineFinalUnitPrice)} className="font-medium [&>span:first-child]:text-slate-700" />
      </div>

      {preview.characteristics.length > 0 ? (
        <>
          <Heading>{t('calcOptions')}</Heading>
          <div className="divide-y divide-slate-100">
            {preview.characteristics.map((c) => (
              <Row
                key={c.characteristicId}
                label={
                  <span className="block min-w-0">
                    <span className="block truncate text-slate-700">{optionLabels[c.characteristicId]}</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {DECIMAL.format(c.price)} · −{plain(c.discountPct)}% · {plain(c.markupPct)}%
                    </span>
                    {c.minApplied ? <span className="ml-1 text-[11px] text-amber-700">· {t('calcMinApplied')}</span> : null}
                  </span>
                }
                value={DECIMAL.format(c.finalUnitPrice)}
              />
            ))}
          </div>
        </>
      ) : null}

      <div className="mt-3 border-t-2 border-slate-800 pt-2">
        <Row label={t('calcUnitPrice')} value={DECIMAL.format(unitPrice)} />
        <Row label={t('calcQuantity')} value={`× ${quantity}`} />
        <div className="flex items-baseline justify-between gap-3 pt-2">
          <span className="text-sm font-semibold text-slate-800">{t('total')}</span>
          <span className="font-mono text-xl font-bold tabular-nums text-brand">{EUR.format(preview.finalPrice)}</span>
        </div>
        <p className="mt-1 text-right text-[11px] text-slate-400">
          {t('calcArea', { m2: DECIMAL.format(preview.totalM2) })} · {t('calcHours', { hours: plain(preview.installationHours) })}
        </p>
      </div>

      <details className="group mt-4 rounded-lg border border-slate-200 bg-slate-50/70">
        <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-xs font-medium text-slate-600 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          {t('calcTrace')}
        </summary>
        <pre className="overflow-x-auto whitespace-pre-wrap border-t border-slate-200 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-600">
          {trace}
        </pre>
      </details>
    </div>
  )
}
