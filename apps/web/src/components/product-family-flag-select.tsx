'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { useLoadingTransition } from '@/components/ui/loading-region'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { Permission } from '@schuco/contracts'

/** The Yes/No settings of a family that are changed right in the list. */
export type ProductFamilyFlag = 'hasPriceList' | 'readyForInvoicing' | 'inLibrary'

const FLAGS: Record<ProductFamilyFlag, { path: string; permission: Permission }> = {
  // The owner's settings of the family itself.
  hasPriceList: { path: 'has-price-list', permission: 'catalog.edit' },
  readyForInvoicing: { path: 'ready-for-invoicing', permission: 'catalog.edit' },
  // Each company's own library, managed by whoever can share families (admins and managers).
  inLibrary: { path: 'library', permission: 'catalog.share' },
}

/**
 * A family's Yes/No setting ("Con listino", "Ready for invoicing", "In libreria"): a select for
 * whoever may change it, a badge for everyone else. Saves on change.
 */
export const ProductFamilyFlagSelect = ({
  flag,
  familyId,
  familyName,
  value: saved,
  canEdit,
}: {
  flag: ProductFamilyFlag
  familyId: string
  familyName: string
  value: boolean
  /** False when the family's settings aren't the caller's to change, e.g. one shared by another company. */
  canEdit: boolean
}) => {
  const t = useTranslations('productFamilyFlags')
  const router = useRouter()
  const { startTransition } = useLoadingTransition()
  const { can } = useAuth()
  // Shows the choice right away; the refreshed page brings the saved value back in.
  const [value, setValue] = useState(saved)
  const [saving, setSaving] = useState(false)
  useEffect(() => setValue(saved), [saved])
  const { path, permission } = FLAGS[flag]

  if (!canEdit || !can(permission)) {
    return <Badge variant={saved ? 'success' : 'muted'}>{saved ? t('yes') : t('no')}</Badge>
  }

  const change = async (next: boolean) => {
    setValue(next)
    setSaving(true)
    try {
      const response = await fetch(`/api/product-families/${familyId}/${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [flag]: next }),
      })
      if (!response.ok) {
        setValue(!next)
        showToast(t(`${flag}.saveFailed`, { name: familyName }), 'error')
        return
      }
      // Filters, counts and the quote builder read the saved value.
      startTransition(() => router.refresh())
    } catch {
      setValue(!next)
      showToast(t(`${flag}.saveFailed`, { name: familyName }), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      aria-label={t(`${flag}.label`, { name: familyName })}
      className={cn(
        'h-8 rounded-md border bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60',
        value ? 'border-emerald-300 text-emerald-700' : 'border-slate-300 text-slate-600',
      )}
      value={value ? 'yes' : 'no'}
      disabled={saving}
      onChange={(e) => void change(e.target.value === 'yes')}
    >
      <option value="yes">{t('yes')}</option>
      <option value="no">{t('no')}</option>
    </select>
  )
}
