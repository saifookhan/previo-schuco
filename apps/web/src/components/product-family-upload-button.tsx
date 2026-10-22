'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import { priceValidityToday, type ProductFamilyImportPreview } from '@schuco/contracts'

interface ProductFamilyUploadButtonProps {
  /** Upload as a new version of this family; omit to import a new family. */
  version?: { familyId: string; familyName: string }
}

type Fields = { name: string; priceValidFrom: string; priceValidTo: string; publish: boolean }

const EMPTY_FIELDS: Fields = { name: '', priceValidFrom: '', priceValidTo: '', publish: false }

const COUNT_KEYS = ['productLines', 'characteristics', 'options', 'priceTables', 'relations', 'images'] as const

/**
 * Excel upload in two steps: the picked file is first checked in memory by the
 * API (nothing saved), then a dialog shows what it holds and asks for the name,
 * price validity and whether to publish. Only "Save" stores anything — the same
 * file is sent again with the confirmed fields.
 */
export const ProductFamilyUploadButton = ({ version }: ProductFamilyUploadButtonProps) => {
  const t = useTranslations('productFamilyUpload')
  const router = useRouter()
  const { user, can } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [checking, setChecking] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ProductFamilyImportPreview | null>(null)
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user || !can('catalog.edit')) {
    return null
  }

  const close = () => {
    setPreview(null)
    setFile(null)
    setError(null)
    setFields(EMPTY_FIELDS)
  }

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) {
      return
    }

    setChecking(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', picked)
      const response = await fetch('/api/product-families/import/preview', { method: 'POST', body: formData })
      const data = (await response.json()) as ProductFamilyImportPreview & { error?: string }
      if (!response.ok) {
        showToast(data.error ? `${t('checkFailed')}: ${data.error}` : t('checkFailed'), 'error')
        return
      }
      // "Choose another file" keeps the dates already typed, but takes the new file's name.
      setFields((current) => ({
        ...current,
        name: data.family.name,
        priceValidFrom: current.priceValidFrom || priceValidityToday(),
      }))
      setFile(picked)
      setPreview(data)
    } catch {
      showToast(t('checkFailedUnreachable'), 'error')
    } finally {
      setChecking(false)
    }
  }

  const dateError = !fields.priceValidFrom
    ? t('validFromRequired')
    : fields.priceValidTo && fields.priceValidTo < fields.priceValidFrom
      ? t('validToBeforeFrom')
      : null

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || dateError) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', fields.name)
      formData.append('priceValidFrom', fields.priceValidFrom)
      formData.append('priceValidTo', fields.priceValidTo)
      formData.append('publish', String(fields.publish))
      const url = version ? `/api/product-families/${version.familyId}/new-version` : '/api/product-families/import'
      const response = await fetch(url, { method: 'POST', body: formData })
      const data = (await response.json()) as { error?: string; family?: { id: string; name: string; version: number } }
      if (!response.ok || !data.family) {
        setError(data.error ? `${t('saveFailed')}: ${data.error}` : t('saveFailed'))
        return
      }
      close()
      showToast(version ? t('versionSaved', { version: data.family.version }) : t('familySaved', { name: data.family.name }))
      router.push(`/app/product-families/${data.family.id}`)
      router.refresh()
    } catch {
      setError(t('saveFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields((current) => ({ ...current, [key]: value }))

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => void onFileSelected(e)} />
      <Button
        type="button"
        variant={version ? 'outline' : 'default'}
        size={version ? 'sm' : 'default'}
        className="gap-2"
        disabled={checking}
        onClick={() => inputRef.current?.click()}
      >
        {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {checking ? t('checking') : version ? t('newVersionButton') : t('importButton')}
      </Button>

      <Dialog.Root open={preview !== null} onOpenChange={(open) => (!open && !saving ? close() : undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl bg-white p-5 shadow-xl focus:outline-none">
            {preview ? (
              <form onSubmit={(e) => void save(e)} className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-slate-900">
                      {version ? t('versionTitle', { name: version.familyName }) : t('importTitle')}
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-slate-500">{t('dialogHint')}</Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button type="button" aria-label={t('cancel')} className="rounded p-1 text-slate-400 hover:text-slate-600" disabled={saving}>
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-900">
                      <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-green-700" />
                      <span className="truncate">{preview.fileName}</span>
                    </p>
                    <Button type="button" variant="ghost" size="sm" disabled={saving || checking} onClick={() => inputRef.current?.click()}>
                      {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : t('changeFile')}
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">
                    {t('workbookFamily')}: <span className="font-medium">{preview.family.name}</span>
                    {[preview.family.technicalName, preview.family.category, preview.family.brand].some(Boolean) ? (
                      <span className="text-slate-500">
                        {' '}
                        · {[preview.family.technicalName, preview.family.category, preview.family.brand].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {COUNT_KEYS.map((key) => (
                      <div key={key} className="rounded-md bg-white px-3 py-2">
                        <dt className="text-xs text-slate-500">{t(`counts.${key}`)}</dt>
                        <dd className="text-base font-semibold text-slate-900">{preview.counts[key]}</dd>
                      </div>
                    ))}
                  </dl>
                  {preview.warnings.length > 0 ? (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="flex items-center gap-2 font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        {t('warningsTitle', { count: preview.warnings.length })}
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-6">
                        {preview.warnings.map((warning, index) => (
                          <li key={index}>
                            {t(`warnings.${warning.code}`, {
                              line: 'productLine' in warning ? warning.productLine : '',
                              characteristic: 'characteristic' in warning ? warning.characteristic : '',
                            })}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </section>

                <div className="space-y-1.5">
                  <Label htmlFor="upload-name">{t('nameLabel')}</Label>
                  <Input id="upload-name" value={fields.name} maxLength={200} onChange={(e) => set('name', e.target.value)} />
                  <p className="text-xs text-slate-500">{t('nameHint')}</p>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-slate-900">{t('validityLegend')}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="upload-valid-from">{t('validFrom')}</Label>
                      <Input
                        id="upload-valid-from"
                        type="date"
                        required
                        value={fields.priceValidFrom}
                        onChange={(e) => set('priceValidFrom', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="upload-valid-to">{t('validTo')}</Label>
                      <Input
                        id="upload-valid-to"
                        type="date"
                        min={fields.priceValidFrom || undefined}
                        value={fields.priceValidTo}
                        onChange={(e) => set('priceValidTo', e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">{t('validityHint')}</p>
                  {dateError && (fields.priceValidTo || !fields.priceValidFrom) ? <p className="text-xs text-red-600">{dateError}</p> : null}
                </fieldset>

                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    checked={fields.publish}
                    onChange={(e) => set('publish', e.target.checked)}
                  />
                  <span>
                    {t('publishLabel')}
                    <span className="block text-xs text-slate-500">{t('publishHint')}</span>
                  </span>
                </label>

                {error ? <p className="text-sm text-red-600">{error}</p> : null}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <Dialog.Close asChild>
                    <Button type="button" variant="outline" disabled={saving}>
                      {t('cancel')}
                    </Button>
                  </Dialog.Close>
                  <Button type="submit" className="gap-2" disabled={saving || checking || dateError !== null}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {saving ? t('saving') : version ? t('saveVersion') : t('saveFamily')}
                  </Button>
                </div>
              </form>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
