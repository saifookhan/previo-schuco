'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { useLoadingTransition } from '@/components/ui/loading-region'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'

/**
 * "Ready for invoicing" Yes/No: only ready families are offered in the quote builder.
 * The owner's catalog editors change it in place; everyone else sees a badge.
 */
export const ProductFamilyInvoicingSelect = ({
  familyId,
  familyName,
  ready,
  canEdit,
}: {
  familyId: string
  familyName: string
  ready: boolean
  /** False for families shared by another company — only the owner decides. */
  canEdit: boolean
}) => {
  const t = useTranslations('productFamilyInvoicing')
  const router = useRouter()
  const { startTransition } = useLoadingTransition()
  const { can } = useAuth()
  // Shows the choice right away; the refreshed page brings the saved value back in.
  const [value, setValue] = useState(ready)
  const [saving, setSaving] = useState(false)
  useEffect(() => setValue(ready), [ready])

  if (!canEdit || !can('catalog.edit')) {
    return <Badge variant={ready ? 'success' : 'muted'}>{ready ? t('yes') : t('no')}</Badge>
  }

  const change = async (next: boolean) => {
    setValue(next)
    setSaving(true)
    try {
      const response = await fetch(`/api/product-families/${familyId}/ready-for-invoicing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readyForInvoicing: next }),
      })
      if (!response.ok) {
        setValue(!next)
        showToast(t('saveFailed', { name: familyName }), 'error')
        return
      }
      // Filters, counts and the quote builder read the saved value.
      startTransition(() => router.refresh())
    } catch {
      setValue(!next)
      showToast(t('saveFailed', { name: familyName }), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      aria-label={t('label', { name: familyName })}
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
