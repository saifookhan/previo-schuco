'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Package, Plus, Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import type { ProductFamilySummary } from '@/types/product-family'

/**
 * "Aggiungi famiglia di prodotto": search and filter the catalog families the company may quote
 * from, or start an empty product typed in by hand.
 */
export const QuoteFamilyPicker = ({
  open,
  onOpenChange,
  families,
  loadingId,
  onPick,
  onPickEmpty,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  families: ProductFamilySummary[]
  /** The family being loaded after it was picked. */
  loadingId: string | null
  onPick: (familyId: string) => void
  onPickEmpty: () => void
}) => {
  const t = useTranslations('quoteEditor')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const categories = useMemo(() => [...new Set(families.map((f) => f.category).filter((c): c is string => Boolean(c)))].sort(), [families])
  const needle = search.trim().toLowerCase()
  const shown = families.filter(
    (family) =>
      (!category || family.category === category) &&
      (!needle ||
        [family.name, family.technicalName, family.brand, family.category, family.ownerCompanyName].some((value) => value?.toLowerCase().includes(needle))),
  )

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
        <Dialog.Content className="fixed left-1/2 top-[10vh] z-50 flex max-h-[80vh] w-[min(94vw,640px)] -translate-x-1/2 flex-col rounded-xl bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <Dialog.Title className="text-[15px] font-semibold text-slate-800">{t('addFamily')}</Dialog.Title>
            <Dialog.Close className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={t('close')}>
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{t('addFamilyHint')}</Dialog.Description>
          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
            <label className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2 top-2 h-4 w-4 text-slate-400" />
              <input
                type="search"
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('searchFamilies')}
                aria-label={t('searchFamilies')}
                className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-2 text-[13px] outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label={t('category')}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-brand"
            >
              <option value="">{t('allCategories')}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {shown.length === 0 ? <p className="px-4 py-6 text-center text-[13px] text-slate-400">{t('noFamiliesFound')}</p> : null}
            {shown.map((family) => (
              <button
                key={family.id}
                type="button"
                disabled={loadingId !== null}
                onClick={() => onPick(family.id)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 disabled:cursor-wait"
              >
                {loadingId === family.id ? (
                  <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-brand" />
                ) : (
                  <Package className="h-4 w-4 flex-shrink-0 text-slate-400" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-800">{family.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {[family.category, family.brand, family.technicalName, family.ownerCompanyName].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">v{family.version}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={onPickEmpty}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2 text-[13px] text-slate-600 transition-colors hover:border-brand hover:bg-blue-50 hover:text-brand"
            >
              <Plus className="h-4 w-4" />
              {t('emptyProduct')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
