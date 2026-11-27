'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Pencil, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { FamilyTextFields } from '@/components/product-family-create-button'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'

interface FamilyTexts {
  name: string
  technicalName: string | null
  category: string | null
  brand: string | null
  distributor: string | null
  description1: string | null
  description2: string | null
  note: string | null
}

/** Edits the family's name, descriptions and the other text Excel used to set. */
export const ProductFamilyDetailsEditor = ({ familyId, family, canEdit }: { familyId: string; family: FamilyTexts; canEdit: boolean }) => {
  const t = useTranslations('productFamilyManual')
  const tEdit = useTranslations('productFamilyEdit')
  const router = useRouter()
  const { user, can } = useAuth()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState({
    name: family.name,
    technicalName: family.technicalName ?? '',
    category: family.category ?? '',
    brand: family.brand ?? '',
    distributor: family.distributor ?? '',
    description1: family.description1 ?? '',
    description2: family.description2 ?? '',
    note: family.note ?? '',
  })

  if (!canEdit || !user || !can('catalog.edit')) return null

  const openDialog = () => {
    setValues({
      name: family.name,
      technicalName: family.technicalName ?? '',
      category: family.category ?? '',
      brand: family.brand ?? '',
      distributor: family.distributor ?? '',
      description1: family.description1 ?? '',
      description2: family.description2 ?? '',
      note: family.note ?? '',
    })
    setError(null)
    setOpen(true)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!values.name.trim()) {
      setError(t('nameRequired'))
      return
    }
    const stored = {
      name: family.name,
      technicalName: family.technicalName ?? '',
      category: family.category ?? '',
      brand: family.brand ?? '',
      distributor: family.distributor ?? '',
      description1: family.description1 ?? '',
      description2: family.description2 ?? '',
      note: family.note ?? '',
    }
    const body: Record<string, string | null> = {}
    const name = values.name.trim()
    if (name !== stored.name) body.name = name
    for (const key of ['technicalName', 'category', 'brand', 'distributor', 'description1', 'description2', 'note'] as const) {
      const next = values[key].trim()
      if (next !== stored[key].trim()) body[key] = next === '' ? null : next
    }
    if (Object.keys(body).length === 0) {
      setOpen(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/product-families/${familyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ? `${t('saveFailed')}: ${data.error}` : t('saveFailed'))
        return
      }
      showToast(t('detailsSaved'))
      setOpen(false)
      router.refresh()
    } catch {
      setError(t('saveFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="gap-1" onClick={openDialog}>
        <Pencil className="h-3.5 w-3.5" /> {t('editDetails')}
      </Button>
      <Dialog.Root open={open} onOpenChange={(next) => (!next && !saving ? setOpen(false) : undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl bg-white p-5 shadow-xl focus:outline-none">
            <form onSubmit={(e) => void save(e)} className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <Dialog.Title className="text-lg font-semibold text-slate-900">{t('editDetailsTitle')}</Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" aria-label={tEdit('close')} className="rounded p-1 text-slate-400 hover:text-slate-600" disabled={saving}>
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
              <FamilyTextFields
                idPrefix="edit"
                values={values}
                includeName
                onChange={(next) => setValues((current) => ({ ...current, ...next, name: next.name ?? current.name }))}
              />
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
                  {tEdit('cancel')}
                </Button>
                <Button type="submit" className="gap-2" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {saving ? tEdit('saving') : tEdit('save')}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
