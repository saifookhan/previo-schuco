'use client'

import { quoteVariantCode, type QuoteVariantRef } from '@schuco/contracts'
import { Star } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

const keyOf = (version: number, alternative: number) => `${version}:${alternative}`

/**
 * Versions down the side, alternatives across. A new version copies only the cell you
 * start from (V1A2 → V2A2). An empty cell is the same either way: nothing was copied there.
 * Hover a filled cell to create the one below it. Hover an empty cell, when the one above
 * exists, to copy that one down.
 */
export const QuoteVariantMatrix = ({
  variants,
  active,
  canEdit,
  busyId,
  onOpen,
  onPromote,
}: {
  variants: QuoteVariantRef[]
  /** The variant open in the editor, if this matrix is inside it. */
  active?: { version: number; alternative: number }
  canEdit: boolean
  busyId: string | null
  onOpen: (variant: QuoteVariantRef) => void
  /** Copies this saved variant to version + 1, same alternative. */
  onPromote: (variant: QuoteVariantRef) => void
}) => {
  const t = useTranslations('quoteEditor')
  const ts = useTranslations('quotes.statusValue')
  const maxVersion = Math.max(1, ...variants.map((variant) => variant.version))
  const maxAlternative = Math.max(1, ...variants.map((variant) => variant.alternative))
  const byKey = new Map(variants.map((variant) => [keyOf(variant.version, variant.alternative), variant]))
  const versions = Array.from({ length: maxVersion }, (_, index) => index + 1)
  const alternatives = Array.from({ length: maxAlternative }, (_, index) => index + 1)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-2 text-sm">
        <thead>
          <tr>
            <th className="w-16" />
            {alternatives.map((alternative) => (
              <th key={alternative} className="px-1 text-center text-xs font-semibold text-slate-500">
                {t('matrixAlternative', { alternative })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr key={version}>
              <th className="pr-2 text-left align-middle text-xs font-semibold text-slate-500">
                {t('matrixVersion', { version })}
              </th>
              {alternatives.map((alternative) => {
                const variant = byKey.get(keyOf(version, alternative))
                const above = byKey.get(keyOf(version - 1, alternative))
                const below = byKey.get(keyOf(version + 1, alternative))
                const code = quoteVariantCode(version, alternative)
                const selected = active?.version === version && active.alternative === alternative
                if (!variant) {
                  const canCopy = canEdit && above && !busyId
                  return (
                    <td key={alternative}>
                      <div
                        className={cn(
                          'group relative flex h-20 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 text-xs text-slate-400',
                          canCopy && 'hover:border-brand hover:bg-white',
                        )}
                      >
                        <span className={cn(canCopy && 'group-hover:opacity-0')}>{t('matrixEmpty')}</span>
                        {canCopy ? (
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => onPromote(above)}
                            className="absolute inset-1 hidden items-center justify-center rounded-lg bg-brand px-2 text-center text-xs font-medium text-white group-hover:flex"
                          >
                            {busyId === above.id ? t('matrixCopying') : t('matrixCopy', { code: quoteVariantCode(version - 1, alternative), next: code })}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  )
                }
                const canPromote = canEdit && !below
                return (
                  <td key={alternative}>
                    <div
                      className={cn(
                        'group relative h-20 rounded-xl border bg-white',
                        selected ? 'border-brand ring-2 ring-brand/30' : 'border-slate-200',
                        variant.isFinal && 'border-amber-300',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(variant)}
                        className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-center hover:bg-slate-50"
                      >
                        <span className="flex items-center gap-1 font-semibold text-slate-800">
                          {variant.isFinal ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" /> : null}
                          {code}
                        </span>
                        {variant.label ? <span className="max-w-full truncate text-[11px] text-slate-500">{variant.label}</span> : null}
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">{ts(variant.status)}</span>
                      </button>
                      {canPromote ? (
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => onPromote(variant)}
                          className="absolute inset-x-1 bottom-1 hidden rounded-md bg-brand px-2 py-1 text-[11px] font-medium text-white group-hover:block"
                        >
                          {busyId === variant.id ? t('matrixCopying') : t('matrixNewVersion', { code, next: quoteVariantCode(version + 1, alternative) })}
                        </button>
                      ) : null}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
