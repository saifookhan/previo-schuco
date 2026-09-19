'use client'

import { Loader2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { hasMinimumRole, useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'

/**
 * Uploads a supplier's Excel workbook to create a new (unpublished draft)
 * product family. Posts through /api/product-families/import — a Next.js
 * route handler — rather than the core API directly, since only the
 * server side can read the httpOnly session cookie.
 */
export const ProductFamilyImportButton = () => {
  const router = useRouter()
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user || !hasMinimumRole(user.role.id, 'super-user')) {
    return null
  }

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) {
      return
    }

    setBusy(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/product-families/import', {
        method: 'POST',
        body: formData,
      })
      const data = (await response.json()) as { error?: string }

      if (!response.ok) {
        setError(data.error ?? 'Import failed')
        return
      }

      router.refresh()
    } catch {
      setError('Import failed — could not reach the server')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => void onFileSelected(e)}
      />
      <Button
        type="button"
        className="gap-2"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {busy ? 'Importing…' : 'Import from Excel'}
      </Button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
