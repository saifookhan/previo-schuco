'use client'

import { useTranslations } from 'next-intl'

import { CAPABILITY_KEYS } from '@/lib/company-capabilities'
import type { CompanyCapabilities } from '@schuco/contracts'

/** Checkbox group for what a company can do — any combination, at least one. */
export const CompanyCapabilitiesField = ({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string
  value: CompanyCapabilities
  onChange: (next: CompanyCapabilities) => void
}) => {
  const t = useTranslations('adminCompanies')

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-700">{t('fieldType')}</legend>
      <div className="space-y-2">
        {CAPABILITY_KEYS.map((key) => (
          <label key={key} htmlFor={`${idPrefix}-${key}`} className="flex cursor-pointer items-start gap-2.5">
            <input
              id={`${idPrefix}-${key}`}
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand"
              checked={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
            />
            <span className="text-sm text-slate-900">
              {t(`typeValue.${key}`)}
              <span className="block text-xs text-slate-500">{t(`typeHint.${key}`)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
