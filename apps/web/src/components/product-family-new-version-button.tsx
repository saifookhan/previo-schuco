'use client'

import { Loader2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'

interface ProductFamilyNewVersionButtonProps {
  familyId: string
}

/**
 * Uploads an updated Excel workbook as a new *version* of this family
 * (version+1, supersedesId set) — a fresh re-import, not a copy of the
 * current version's rows. The current version is left exactly as-is.
 * Navigates to the new version's detail page on success.
 */
export const ProductFamilyNewVersionButton = ({ familyId }: ProductFamilyNewVersionButtonProps) => {
  const t = useTranslations('productFamilyVersion')
  const router = useRouter()
  const { user, can } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  if (!user || !can('catalog.edit')) {
    return null
  }

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) {
      return
    }

    setBusy(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/product-families/${familyId}/new-version`, {
        method: 'POST',
        body: formData,
      })
      const data = (await response.json()) as { error?: string; family?: { id: string; version: number } }

      if (!response.ok || !data.family) {
        showToast(data.error ? `${t('newVersionFailed')}: ${data.error}` : t('newVersionFailed'), 'error')
        return
      }

      showToast(t('newVersionSuccess', { version: data.family.version }))
      router.push(`/app/product-families/${data.family.id}`)
      router.refresh()
    } catch {
      showToast(t('newVersionFailedUnreachable'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => void onFileSelected(e)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {busy ? t('creatingNewVersion') : t('newVersionButton')}
      </Button>
    </>
  )
}
