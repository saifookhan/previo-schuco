'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  EMPTY_PRODUCT_FAMILY_DETAILS,
  ProductFamilyDetailsFields,
  useProductFamilyDetailsError,
  type ProductFamilyDetails,
} from '@/components/product-family-details-fields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import { priceValidityToday } from '@schuco/contracts'

type ExtraFields = {
  technicalName: string
  category: string
  brand: string
  distributor: string
  description1: string
  description2: string
  note: string
}

const EMPTY_EXTRA: ExtraFields = {
  technicalName: '',
  category: '',
  brand: '',
  distributor: '',
  description1: '',
  description2: '',
  note: '',
}

/** "Create family" on the list: an empty draft, then the family page where lines and characteristics are added. */
export const ProductFamilyCreateButton = () => {
  const t = useTranslations('productFamilyManual')
  const tUpload = useTranslations('productFamilyUpload')
  const router = useRouter()
  const { user, can } = useAuth()
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState<ProductFamilyDetails>({ ...EMPTY_PRODUCT_FAMILY_DETAILS, priceValidFrom: priceValidityToday() })
  const [extra, setExtra] = useState<ExtraFields>(EMPTY_EXTRA)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dateError = useProductFamilyDetailsError()(details)

  if (!user || !can('catalog.edit')) return null

  const close = () => {
    if (saving) return
    setOpen(false)
    setError(null)
    setDetails({ ...EMPTY_PRODUCT_FAMILY_DETAILS, priceValidFrom: priceValidityToday() })
    setExtra(EMPTY_EXTRA)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!details.name.trim()) {
      setError(t('nameRequired'))
      return
    }
    if (dateError) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/product-families', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: details.name.trim(),
          technicalName: extra.technicalName,
          category: extra.category,
          brand: extra.brand,
          distributor: extra.distributor,
          description1: extra.description1,
          description2: extra.description2,
          note: extra.note,
          priceValidFrom: details.priceValidFrom,
          priceValidTo: details.priceValidTo || null,
          publish: details.publish,
          readyForInvoicing: details.readyForInvoicing,
        }),
      })
      const data = (await response.json().catch(() => ({}))) as { family?: { id: string }; error?: string }
      if (!response.ok || !data.family) {
        setError(data.error ? `${t('createFailed')}: ${data.error}` : t('createFailed'))
        return
      }
      showToast(t('created', { name: details.name.trim() }))
      setOpen(false)
      router.push(`/app/product-families/${data.family.id}`)
    } catch {
      setError(t('createFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {t('createButton')}
      </Button>
      <Dialog.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl bg-white p-5 shadow-xl focus:outline-none">
            <form onSubmit={(e) => void save(e)} className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Dialog.Title className="text-lg font-semibold text-slate-900">{t('createTitle')}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-slate-500">{t('createHint')}</Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button type="button" aria-label={tUpload('cancel')} className="rounded p-1 text-slate-400 hover:text-slate-600" disabled={saving}>
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>

              <ProductFamilyDetailsFields
                idPrefix="create"
                details={details}
                dateError={dateError}
                onChange={setDetails}
                nameHint={t('createNameHint')}
              />
              <FamilyTextFields idPrefix="create" values={extra} onChange={setExtra} />
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline" disabled={saving}>
                    {tUpload('cancel')}
                  </Button>
                </Dialog.Close>
                <Button type="submit" className="gap-2" disabled={saving || dateError !== null}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {saving ? t('creating') : t('saveFamily')}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

/** The family text that Excel used to be the only way to set. Shared by create and edit. */
export const FamilyTextFields = ({
  idPrefix,
  values,
  onChange,
  includeName,
}: {
  idPrefix: string
  values: ExtraFields & { name?: string }
  onChange: (next: ExtraFields & { name?: string }) => void
  includeName?: boolean
}) => {
  const t = useTranslations('productFamilyManual')
  const set = (key: keyof (ExtraFields & { name?: string }), value: string) => onChange({ ...values, [key]: value })
  const text = (key: keyof ExtraFields, label: string, multiline = false) => (
    <div className="space-y-1.5" key={key}>
      <Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
      {multiline ? (
        <textarea
          id={`${idPrefix}-${key}`}
          value={values[key]}
          rows={3}
          onChange={(e) => set(key, e.target.value)}
          className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
        />
      ) : (
        <Input id={`${idPrefix}-${key}`} value={values[key]} maxLength={200} onChange={(e) => set(key, e.target.value)} />
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      {includeName ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-family-name`}>{t('fieldName')}</Label>
          <Input id={`${idPrefix}-family-name`} value={values.name ?? ''} maxLength={200} onChange={(e) => set('name', e.target.value)} />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {text('technicalName', t('fieldTechnicalName'))}
        {text('category', t('fieldCategory'))}
        {text('brand', t('fieldBrand'))}
        {text('distributor', t('fieldDistributor'))}
      </div>
      {text('description1', t('fieldDescription1'), true)}
      {text('description2', t('fieldDescription2'), true)}
      {text('note', t('fieldNote'), true)}
    </div>
  )
}
