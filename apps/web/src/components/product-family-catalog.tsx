'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  buildPrice,
  emptyMatrixDraft,
  priceStateFromItem,
  ProductFamilyPriceFields,
  type PriceFieldState,
} from '@/components/product-family-price-fields'
import { ProductFamilyMatrixPreview } from '@/components/product-family-matrix-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import type { Characteristic, PricingMatrix, ProductLine } from '@/types/product-family'

interface ProductFamilyCatalogProps {
  familyId: string
  lines: ProductLine[]
  characteristics: Characteristic[]
  matrices: PricingMatrix[]
  relations: { productLineId: string; characteristicId: string }[]
  /** Server edit policy and ownership. The role is checked here too. */
  canEdit: boolean
}

const tidy = (value: string | null): string => (value == null ? '' : String(Number(value)))
const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim())

const emptyPrice = (): PriceFieldState => ({
  priceType: 'Valore_Fisso [€/Pz]',
  value: '0',
  formula: 'valore',
  matrix: emptyMatrixDraft(),
})

interface LineForm {
  name: string
  description: string
  unitName: string
  unitSymbol: string
  minValue: string
  discountPct: string
  markupPct: string
  installationHoursPerUnit: string
  characteristicIds: string[]
  price: PriceFieldState
}

interface OptionForm {
  name: string
  minValue: string
  discountPct: string
  markupPct: string
  installationHoursPerUnit: string
  price: PriceFieldState
}

type Editor =
  | { kind: 'line'; lineId: string | null }
  | { kind: 'characteristic'; characteristicId: string | null }
  | { kind: 'option'; parentId: string; optionId: string | null }
  | null

type PendingDelete =
  | { kind: 'line'; id: string; name: string }
  | { kind: 'characteristic'; id: string; name: string }
  | { kind: 'option'; id: string; name: string }
  | null

/** Product lines and characteristics, with add / edit / delete when the caller may change the family. */
export const ProductFamilyCatalog = ({ familyId, lines, characteristics, matrices, relations, canEdit }: ProductFamilyCatalogProps) => {
  const t = useTranslations('productFamilyManual')
  const tDetail = useTranslations('productFamilyDetail')
  const tEdit = useTranslations('productFamilyEdit')
  const format = useFormatter()
  const router = useRouter()
  const { user, can } = useAuth()
  const editable = canEdit && !!user && can('catalog.edit')

  const [editor, setEditor] = useState<Editor>(null)
  const [lineForm, setLineForm] = useState<LineForm | null>(null)
  const [optionForm, setOptionForm] = useState<OptionForm | null>(null)
  const [characteristicName, setCharacteristicName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [deleting, setDeleting] = useState(false)

  const euro = (value: string) => format.number(Number(value), { style: 'currency', currency: 'EUR' })
  const mains = characteristics.filter((item) => !item.parentId)
  const optionsOf = (parentId: string) => characteristics.filter((item) => item.parentId === parentId)
  const matrixById = new Map(matrices.map((matrix) => [matrix.id, matrix]))
  const characteristicsByLine = new Map<string, string[]>()
  for (const relation of relations) {
    characteristicsByLine.set(relation.productLineId, [...(characteristicsByLine.get(relation.productLineId) ?? []), relation.characteristicId])
  }

  const close = () => {
    if (saving) return
    setEditor(null)
    setError(null)
  }

  const openLine = (line: ProductLine | null) => {
    const ids = line ? (characteristicsByLine.get(line.id) ?? []) : mains.map((item) => item.id)
    setLineForm({
      name: line?.name ?? '',
      description: line?.description ?? '',
      unitName: line?.unitName ?? '',
      unitSymbol: line?.unitSymbol ?? '',
      minValue: tidy(line?.minValue ?? null),
      discountPct: tidy(line?.discountPct ?? null),
      markupPct: tidy(line?.markupPct ?? null),
      installationHoursPerUnit: tidy(line?.installationHoursPerUnit ?? null),
      characteristicIds: ids,
      price: line ? priceStateFromItem(line, line.pricingMatrixId ? matrixById.get(line.pricingMatrixId) : undefined) : emptyPrice(),
    })
    setError(null)
    setEditor({ kind: 'line', lineId: line?.id ?? null })
  }

  const openCharacteristic = (characteristic: Characteristic | null) => {
    setCharacteristicName(characteristic?.name ?? '')
    setError(null)
    setEditor({ kind: 'characteristic', characteristicId: characteristic?.id ?? null })
  }

  const openOption = (parentId: string, option: Characteristic | null) => {
    setOptionForm({
      name: option?.name ?? '',
      minValue: tidy(option?.minValue ?? null),
      discountPct: tidy(option?.discountPct ?? null),
      markupPct: tidy(option?.markupPct ?? null),
      installationHoursPerUnit: tidy(option?.installationHoursPerUnit ?? null),
      price: option ? priceStateFromItem(option, option.pricingMatrixId ? matrixById.get(option.pricingMatrixId) : undefined) : emptyPrice(),
    })
    setError(null)
    setEditor({ kind: 'option', parentId, optionId: option?.id ?? null })
  }

  const fail = async (response: Response): Promise<boolean> => {
    if (response.ok) return false
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    setError(data.error ? `${t('saveFailed')}: ${data.error}` : t('saveFailed'))
    return true
  }

  const saved = (name: string) => {
    showToast(t('saved', { name }))
    setEditor(null)
    router.refresh()
  }

  const saveLine = async () => {
    if (!lineForm || editor?.kind !== 'line') return
    if (!lineForm.name.trim()) {
      setError(t('nameRequired'))
      return
    }
    if (!lineForm.unitName.trim() || !lineForm.unitSymbol.trim()) {
      setError(t('unitsRequired'))
      return
    }
    const price = buildPrice(lineForm.price, (key) => t(key as 'valueRequired'), (key) => tEdit(key as 'matrixError.axisEmpty'))
    if (!price.ok) {
      setError(price.error)
      return
    }
    const payload = {
      name: lineForm.name.trim(),
      description: blankToNull(lineForm.description),
      unitName: lineForm.unitName.trim(),
      unitSymbol: lineForm.unitSymbol.trim(),
      minValue: blankToNull(lineForm.minValue),
      discountPct: blankToNull(lineForm.discountPct),
      markupPct: blankToNull(lineForm.markupPct),
      installationHoursPerUnit: blankToNull(lineForm.installationHoursPerUnit),
      characteristicIds: lineForm.characteristicIds,
      price: price.price,
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(
        editor.lineId ? `/api/product-families/${familyId}/lines/${editor.lineId}` : `/api/product-families/${familyId}/lines`,
        { method: editor.lineId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      )
      if (await fail(response)) return
      saved(payload.name)
    } catch {
      setError(t('saveFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  const saveCharacteristic = async () => {
    if (editor?.kind !== 'characteristic') return
    if (!characteristicName.trim()) {
      setError(t('nameRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(
        editor.characteristicId
          ? `/api/product-families/${familyId}/characteristics/${editor.characteristicId}`
          : `/api/product-families/${familyId}/characteristics`,
        {
          method: editor.characteristicId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: characteristicName.trim() }),
        },
      )
      if (await fail(response)) return
      saved(characteristicName.trim())
    } catch {
      setError(t('saveFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  const saveOption = async () => {
    if (!optionForm || editor?.kind !== 'option') return
    if (!optionForm.name.trim()) {
      setError(t('nameRequired'))
      return
    }
    const price = buildPrice(optionForm.price, (key) => t(key as 'valueRequired'), (key) => tEdit(key as 'matrixError.axisEmpty'))
    if (!price.ok) {
      setError(price.error)
      return
    }
    const payload = {
      name: optionForm.name.trim(),
      parentId: editor.parentId,
      minValue: blankToNull(optionForm.minValue),
      discountPct: blankToNull(optionForm.discountPct),
      markupPct: blankToNull(optionForm.markupPct),
      installationHoursPerUnit: blankToNull(optionForm.installationHoursPerUnit),
      price: price.price,
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(
        editor.optionId
          ? `/api/product-families/${familyId}/characteristics/${editor.optionId}`
          : `/api/product-families/${familyId}/characteristics`,
        { method: editor.optionId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      )
      if (await fail(response)) return
      saved(payload.name)
    } catch {
      setError(t('saveFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const path =
      pendingDelete.kind === 'line'
        ? `/api/product-families/${familyId}/lines/${pendingDelete.id}`
        : `/api/product-families/${familyId}/characteristics/${pendingDelete.id}`
    setDeleting(true)
    try {
      const response = await fetch(path, { method: 'DELETE' })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        showToast(data.error ? `${t('saveFailed')}: ${data.error}` : t('saveFailed'))
        return
      }
      showToast(t('deleted', { name: pendingDelete.name }))
      setPendingDelete(null)
      router.refresh()
    } catch {
      showToast(t('saveFailedUnreachable'))
    } finally {
      setDeleting(false)
    }
  }

  const optionTerms = (option: Characteristic) =>
    [
      option.minValue != null ? tDetail('optionMin', { value: euro(option.minValue) }) : null,
      option.discountPct != null && option.markupPct != null && (Number(option.discountPct) !== 0 || Number(option.markupPct) !== 100)
        ? tDetail('optionTerms', { discount: Number(option.discountPct), markup: Number(option.markupPct) })
        : null,
      Number(option.installationHoursPerUnit ?? 0) > 0 ? tDetail('optionHours', { hours: Number(option.installationHoursPerUnit) }) : null,
    ]
      .filter(Boolean)
      .join(' · ')

  const economics = (form: { minValue: string; discountPct: string; markupPct: string; installationHoursPerUnit: string }, set: (patch: Partial<LineForm & OptionForm>) => void) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id="min" label={t('fieldMinValue')} value={form.minValue} onChange={(minValue) => set({ minValue })} />
      <Field id="discount" label={tEdit('fieldDiscount')} value={form.discountPct} onChange={(discountPct) => set({ discountPct })} />
      <div className="space-y-1.5">
        <Field id="markup" label={tEdit('fieldMarkup')} value={form.markupPct} onChange={(markupPct) => set({ markupPct })} />
        <p className="text-xs text-slate-500">{tEdit('markupHint')}</p>
      </div>
      <Field id="hours" label={tEdit('fieldInstallationHours')} value={form.installationHoursPerUnit} onChange={(installationHoursPerUnit) => set({ installationHoursPerUnit })} />
    </div>
  )

  return (
    <>
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{tDetail('productLinesCount', { count: lines.length })}</CardTitle>
          {editable ? (
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => openLine(null)}>
              <Plus className="h-3.5 w-3.5" /> {t('addLine')}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {lines.length === 0 ? <p className="px-6 py-4 text-sm text-slate-500">{t('emptyLines')}</p> : null}
          {lines.length > 0 ? (
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-6 py-3 font-medium">{tDetail('nameHeader')}</th>
                  <th className="px-6 py-3 font-medium">{tDetail('pricingHeader')}</th>
                  <th className="px-6 py-3 font-medium">{tDetail('unitHeader')}</th>
                  <th className="px-6 py-3 font-medium">{tDetail('discountMarkupHeader')}</th>
                  <th className="px-6 py-3 font-medium">{tDetail('characteristicsHeader')}</th>
                  {editable ? <th className="px-6 py-3 font-medium">{t('actions')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b border-slate-50 align-top hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {line.name}
                      {line.description ? <p className="mt-0.5 text-xs font-normal text-slate-400">{line.description}</p> : null}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {line.pricingMatrixId && matrixById.has(line.pricingMatrixId) ? (
                        <ProductFamilyMatrixPreview familyId={familyId} matrix={matrixById.get(line.pricingMatrixId)!} label={tDetail('pricingMatrix')} editable={editable} />
                      ) : (
                        <span className="font-mono text-xs">
                          {line.formula} <span className="text-slate-400">(valore = {line.value})</span>
                        </span>
                      )}
                      {line.minValue != null ? <p className="mt-0.5 text-xs text-slate-400">{tDetail('minValue', { value: euro(line.minValue) })}</p> : null}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{line.unitName || line.unitSymbol || '—'}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {Number(line.discountPct ?? 0)}% / {Number(line.markupPct ?? 100)}%
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {(characteristicsByLine.get(line.id) ?? []).map((id) => {
                        const name = mains.find((item) => item.id === id)?.name
                        return name ? (
                          <Badge key={id} variant="muted" className="mr-1 mb-1">
                            {name}
                          </Badge>
                        ) : null
                      })}
                    </td>
                    {editable ? (
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <Button type="button" variant="icon" size="icon" aria-label={t('editLine')} onClick={() => openLine(line)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="icon" size="icon" aria-label={t('deleteLine')} onClick={() => setPendingDelete({ kind: 'line', id: line.id, name: line.name })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{tDetail('characteristicsCount', { count: mains.length })}</CardTitle>
          {editable ? (
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => openCharacteristic(null)}>
              <Plus className="h-3.5 w-3.5" /> {t('addCharacteristic')}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="divide-y divide-slate-50 p-0">
          {mains.length === 0 ? <p className="px-6 py-4 text-sm text-slate-500">{t('emptyCharacteristics')}</p> : null}
          {mains.map((main) => (
            <div key={main.id} className="px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-900">{main.name}</p>
                {editable ? (
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => openOption(main.id, null)}>
                      <Plus className="h-3.5 w-3.5" /> {t('addOption')}
                    </Button>
                    <Button type="button" variant="icon" size="icon" aria-label={t('editCharacteristic')} onClick={() => openCharacteristic(main)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="icon" size="icon" aria-label={t('deleteCharacteristic')} onClick={() => setPendingDelete({ kind: 'characteristic', id: main.id, name: main.name })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {optionsOf(main.id).map((option) => {
                  const terms = optionTerms(option)
                  return (
                    <span key={option.id} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600" title={option.pricingMatrixId ? undefined : `${option.formula} (valore = ${option.value})`}>
                      {option.name}
                      {option.pricingMatrixId && matrixById.has(option.pricingMatrixId) ? (
                        <ProductFamilyMatrixPreview familyId={familyId} matrix={matrixById.get(option.pricingMatrixId)!} label={tDetail('pricingMatrix')} editable={editable} />
                      ) : null}
                      {terms ? <span className="text-slate-400">· {terms}</span> : null}
                      {editable ? (
                        <>
                          <button type="button" className="rounded p-0.5 text-slate-400 hover:text-brand" aria-label={t('editOption')} onClick={() => openOption(main.id, option)}>
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button type="button" className="rounded p-0.5 text-slate-400 hover:text-red-600" aria-label={t('deleteOption')} onClick={() => setPendingDelete({ kind: 'option', id: option.id, name: option.name })}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      ) : null}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog.Root open={editor !== null} onOpenChange={(open) => (!open ? close() : undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl bg-white p-5 shadow-xl focus:outline-none">
            <div className="mb-4 flex items-start justify-between gap-4">
              <Dialog.Title className="text-lg font-semibold text-slate-900">
                {editor?.kind === 'line' ? (editor.lineId ? t('editLine') : t('addLine')) : null}
                {editor?.kind === 'characteristic' ? (editor.characteristicId ? t('editCharacteristic') : t('addCharacteristic')) : null}
                {editor?.kind === 'option' ? (editor.optionId ? t('editOption') : t('addOption')) : null}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" aria-label={tEdit('close')} className="rounded p-1 text-slate-400 hover:text-slate-600" disabled={saving}>
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            {editor?.kind === 'line' && lineForm ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveLine()
                }}
              >
                <Field id="line-name" label={t('fieldName')} value={lineForm.name} onChange={(name) => setLineForm({ ...lineForm, name })} />
                <Field id="line-description" label={t('fieldDescription')} value={lineForm.description} onChange={(description) => setLineForm({ ...lineForm, description })} multiline />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="line-unit-name" label={t('fieldUnitName')} value={lineForm.unitName} onChange={(unitName) => setLineForm({ ...lineForm, unitName })} />
                  <Field id="line-unit-symbol" label={t('fieldUnitSymbol')} value={lineForm.unitSymbol} onChange={(unitSymbol) => setLineForm({ ...lineForm, unitSymbol })} />
                </div>
                <ProductFamilyPriceFields idPrefix="line" state={lineForm.price} onChange={(price) => setLineForm({ ...lineForm, price })} />
                {economics(lineForm, (patch) => setLineForm({ ...lineForm, ...patch }))}
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-slate-900">{t('characteristicsApply')}</legend>
                  {mains.length === 0 ? <p className="text-xs text-slate-500">{t('noCharacteristics')}</p> : null}
                  {mains.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={lineForm.characteristicIds.includes(item.id)}
                        onChange={(e) =>
                          setLineForm({
                            ...lineForm,
                            characteristicIds: e.target.checked
                              ? [...lineForm.characteristicIds, item.id]
                              : lineForm.characteristicIds.filter((id) => id !== item.id),
                          })
                        }
                      />
                      {item.name}
                    </label>
                  ))}
                </fieldset>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <DialogActions saving={saving} onCancel={close} saveLabel={tEdit('save')} savingLabel={tEdit('saving')} cancelLabel={tEdit('cancel')} />
              </form>
            ) : null}

            {editor?.kind === 'characteristic' ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveCharacteristic()
                }}
              >
                <Field id="characteristic-name" label={t('characteristicName')} value={characteristicName} onChange={setCharacteristicName} />
                {!editor.characteristicId ? <p className="text-xs text-slate-500">{t('characteristicAppliesHint')}</p> : null}
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <DialogActions saving={saving} onCancel={close} saveLabel={tEdit('save')} savingLabel={tEdit('saving')} cancelLabel={tEdit('cancel')} />
              </form>
            ) : null}

            {editor?.kind === 'option' && optionForm ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveOption()
                }}
              >
                <Field id="option-name" label={t('optionName')} value={optionForm.name} onChange={(name) => setOptionForm({ ...optionForm, name })} />
                <ProductFamilyPriceFields idPrefix="option" state={optionForm.price} onChange={(price) => setOptionForm({ ...optionForm, price })} />
                {economics(optionForm, (patch) => setOptionForm({ ...optionForm, ...patch }))}
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <DialogActions saving={saving} onCancel={close} saveLabel={tEdit('save')} savingLabel={tEdit('saving')} cancelLabel={tEdit('cancel')} />
              </form>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.kind === 'line' ? t('deleteLineTitle') : pendingDelete?.kind === 'option' ? t('deleteOptionTitle') : t('deleteCharacteristicTitle')}
        description={
          pendingDelete?.kind === 'line'
            ? t('deleteLineDescription', { name: pendingDelete.name })
            : pendingDelete?.kind === 'option'
              ? t('deleteOptionDescription', { name: pendingDelete.name })
              : t('deleteCharacteristicDescription', { name: pendingDelete?.name ?? '' })
        }
        confirmLabel={t('delete')}
        cancelLabel={tEdit('cancel')}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  )
}

const Field = ({
  id,
  label,
  value,
  onChange,
  multiline = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
}) => (
  <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    {multiline ? (
      <textarea
        id={id}
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand"
      />
    ) : (
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    )}
  </div>
)

const DialogActions = ({
  saving,
  onCancel,
  saveLabel,
  savingLabel,
  cancelLabel,
}: {
  saving: boolean
  onCancel: () => void
  saveLabel: string
  savingLabel: string
  cancelLabel: string
}) => (
  <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
    <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
      {cancelLabel}
    </Button>
    <Button type="submit" className="gap-2" disabled={saving}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {saving ? savingLabel : saveLabel}
    </Button>
  </div>
)
