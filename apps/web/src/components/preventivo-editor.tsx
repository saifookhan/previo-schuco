'use client'

import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { CollapsibleSection } from '@/components/collapsible-section'
import { ProductFamilyCard } from '@/components/product-family-card'
import { QuoteHeader } from '@/components/quote-header'
import {
  DEMO_FAMILIES,
  formatCurrency,
  type ProductFamily,
} from '@/types/quote'

interface PreventivoEditorProps {
  locale: string
}

/**
 * Main quote editor page replicating the PREVIO demo preventivo layout.
 */
export const PreventivoEditor = ({ locale }: PreventivoEditorProps) => {
  const t = useTranslations()
  const [families, setFamilies] = useState<ProductFamily[]>(DEMO_FAMILIES)

  const total = useMemo(
    () => families.reduce((sum, f) => sum + f.total, 0),
    [families],
  )

  const updateFamily = (id: string, updates: Partial<ProductFamily>) => {
    setFamilies((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    )
  }

  const deleteFamily = (id: string) => {
    setFamilies((prev) => prev.filter((f) => f.id !== id))
  }

  const duplicateFamily = (id: string) => {
    const source = families.find((f) => f.id === id)
    if (!source) return
    setFamilies((prev) => [
      ...prev,
      { ...source, id: crypto.randomUUID(), name: `${source.name} (copia)` },
    ])
  }

  const moveFamily = (id: string, direction: 'up' | 'down') => {
    setFamilies((prev) => {
      const index = prev.findIndex((f) => f.id === id)
      if (index === -1) return prev
      const next = [...prev]
      const swapIndex = direction === 'up' ? index - 1 : index + 1
      if (swapIndex < 0 || swapIndex >= next.length) return prev
      ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
      return next
    })
  }

  const addFamily = () => {
    setFamilies((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: 'Nuova famiglia',
        total: 0,
        isValid: true,
        isAlternative: false,
      },
    ])
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 pb-10 font-sans">
      <QuoteHeader
        reference={t('demo.reference')}
        client={t('demo.client')}
        project={t('demo.project')}
        total={total}
        locale={locale}
      />

      <main className="mx-auto max-w-[1200px] px-4 md:px-6">
        <div className="mt-4 flex flex-col gap-3 pb-20">
          <CollapsibleSection
            title={t('intro.title')}
            preview={t('intro.preview')}
            ariaLabel={t('intro.title')}
          >
            <p className="whitespace-pre-line">{t('intro.body')}</p>
          </CollapsibleSection>

          <div className="flex flex-col gap-3">
            {families.map((family, index) => (
              <ProductFamilyCard
                key={family.id}
                family={family}
                locale={locale}
                isFirst={index === 0}
                isLast={index === families.length - 1}
                onUpdate={updateFamily}
                onDelete={deleteFamily}
                onDuplicate={duplicateFamily}
                onMoveUp={(id) => moveFamily(id, 'up')}
                onMoveDown={(id) => moveFamily(id, 'down')}
              />
            ))}
          </div>

          <button
            onClick={addFamily}
            title={t('actions.addFamilyHint')}
            className="flex h-9 w-full items-center justify-center rounded-xl bg-brand px-3 text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-brand-dark md:px-4"
          >
            <Plus className="mr-2 h-5 w-5" />
            {t('actions.addFamily')}
          </button>

          <CollapsibleSection
            title={t('summary.title')}
            rightContent={
              <span className="ml-2 font-mono text-[13px] tabular-nums text-slate-400">
                {formatCurrency(total, locale)}
              </span>
            }
            ariaLabel={t('summary.title')}
          >
            <div className="space-y-2">
              {families.map((f) => (
                <div key={f.id} className="flex justify-between text-sm">
                  <span>{f.name}</span>
                  <span className="font-mono tabular-nums">{formatCurrency(f.total, locale)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-brand">
                <span>{t('header.totalLabel')}</span>
                <span className="font-mono tabular-nums">{formatCurrency(total, locale)}</span>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </main>
    </div>
  )
}
