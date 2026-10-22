'use client'

import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ProductFamilyDetails = { name: string; priceValidFrom: string; priceValidTo: string; publish: boolean }

export const EMPTY_PRODUCT_FAMILY_DETAILS: ProductFamilyDetails = { name: '', priceValidFrom: '', priceValidTo: '', publish: false }

/** Returns a check for the dates' problem, if any — Save stays disabled while there is one. */
export const useProductFamilyDetailsError = () => {
  const t = useTranslations('productFamilyUpload')
  return (details: ProductFamilyDetails): string | null => {
    if (!details.priceValidFrom) return t('validFromRequired')
    if (details.priceValidTo && details.priceValidTo < details.priceValidFrom) return t('validToBeforeFrom')
    return null
  }
}

/**
 * Name, price validity and "Publish right away" — what the upload and copy dialogs both ask
 * before a new family is saved.
 */
export const ProductFamilyDetailsFields = ({
  idPrefix,
  details,
  dateError,
  onChange,
  nameHint,
}: {
  /** Keeps the inputs' ids unique when two dialogs are on one page. */
  idPrefix: string
  details: ProductFamilyDetails
  /** From `useProductFamilyDetailsError`, which the dialog also needs to disable Save. */
  dateError: string | null
  /** Receives an updater, so changes made in quick succession never overwrite each other. */
  onChange: (update: (current: ProductFamilyDetails) => ProductFamilyDetails) => void
  nameHint: string
}) => {
  const t = useTranslations('productFamilyUpload')
  const set = <K extends keyof ProductFamilyDetails>(key: K, value: ProductFamilyDetails[K]) =>
    onChange((current) => ({ ...current, [key]: value }))

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>{t('nameLabel')}</Label>
        <Input id={`${idPrefix}-name`} value={details.name} maxLength={200} onChange={(e) => set('name', e.target.value)} />
        <p className="text-xs text-slate-500">{nameHint}</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-900">{t('validityLegend')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-valid-from`}>{t('validFrom')}</Label>
            <Input
              id={`${idPrefix}-valid-from`}
              type="date"
              required
              value={details.priceValidFrom}
              onChange={(e) => set('priceValidFrom', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-valid-to`}>{t('validTo')}</Label>
            <Input
              id={`${idPrefix}-valid-to`}
              type="date"
              min={details.priceValidFrom || undefined}
              value={details.priceValidTo}
              onChange={(e) => set('priceValidTo', e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">{t('validityHint')}</p>
        {dateError && (details.priceValidTo || !details.priceValidFrom) ? <p className="text-xs text-red-600">{dateError}</p> : null}
      </fieldset>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
          checked={details.publish}
          onChange={(e) => set('publish', e.target.checked)}
        />
        <span>
          {t('publishLabel')}
          <span className="block text-xs text-slate-500">{t('publishHint')}</span>
        </span>
      </label>
    </>
  )
}
