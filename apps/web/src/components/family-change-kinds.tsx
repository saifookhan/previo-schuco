'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import { FAMILY_CHANGE_KINDS, type FamilyChangeCounts, type FamilyChangeKind } from '@schuco/contracts'

/** One hue per change kind (validated as a set: lightness, chroma, colour-blind separation). Every mark also carries a glyph and a label, so colour is never the only cue. */
export const KIND_COLOR: Record<FamilyChangeKind, string> = {
  added: '#1baf7a',
  removed: '#e34948',
  economic: '#eda100',
  description: '#2a78d6',
}
export const KIND_GLYPH: Record<FamilyChangeKind, string> = { added: '+', removed: '−', economic: '€', description: 'T' }

export const totalChanges = (counts: FamilyChangeCounts) => FAMILY_CHANGE_KINDS.reduce((sum, kind) => sum + counts[kind], 0)

export const KindGlyph = ({ kind, className }: { kind: FamilyChangeKind; className?: string }) => (
  <span
    aria-hidden
    className={cn('inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white', className)}
    style={{ backgroundColor: KIND_COLOR[kind] }}
  >
    {KIND_GLYPH[kind]}
  </span>
)

/** How many changes of each kind, as small glyph + number chips; "no changes" when there are none. */
export const ChangeCountChips = ({ counts }: { counts: FamilyChangeCounts }) => {
  const t = useTranslations('productFamilyVersions')
  if (totalChanges(counts) === 0) return <span className="text-[11px] text-slate-400">{t('noChangesShort')}</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {FAMILY_CHANGE_KINDS.filter((kind) => counts[kind] > 0).map((kind) => (
        <span key={kind} className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-600" title={t(`kinds.${kind}`)}>
          <KindGlyph kind={kind} className="h-3.5 w-3.5 text-[9px]" />
          {counts[kind]}
          <span className="sr-only">{t(`kinds.${kind}`)}</span>
        </span>
      ))}
    </span>
  )
}
