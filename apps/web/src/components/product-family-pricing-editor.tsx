'use client'

import { Loader2, Pencil, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { hasMinimumRole, useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'

interface LineValues {
  value: string
  formula: string
  discountPct: string
  markupPct: string
  installationHoursPerUnit: string
}

type Props =
  | {
      kind: 'line'
      familyId: string
      itemId: string
      itemName: string
      editable: boolean
      initial: LineValues
    }
  | {
      kind: 'characteristic'
      familyId: string
      itemId: string
      itemName: string
      editable: boolean
      initial: { value: string | null; formula: string | null }
    }

/** Trailing zeros from Postgres numerics ("12.5000") are noise in an edit box. */
const tidy = (v: string | null): string => (v === null ? '' : String(Number(v)))

/**
 * Pencil button + modal form for editing one product line's pricing
 * (value, formula, discount, markup, installation hours) or one
 * sub-characteristic's price (value, formula). Renders nothing for users
 * below super-user or when the server marks the family non-editable.
 * Values are validated on the API (ranges, formula syntax and allowed
 * variables); its message is shown under the form.
 */
export const ProductFamilyPricingEditor = (props: Props) => {
  const t = useTranslations('productFamilyEdit')
  const router = useRouter()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})

  if (!props.editable || !user || !hasMinimumRole(user.role.id, 'super-user')) {
    return null
  }

  const isLine = props.kind === 'line'

  const openDialog = () => {
    setForm(
      props.kind === 'line'
        ? {
            value: tidy(props.initial.value),
            formula: props.initial.formula,
            discountPct: tidy(props.initial.discountPct),
            markupPct: tidy(props.initial.markupPct),
            installationHoursPerUnit: tidy(props.initial.installationHoursPerUnit),
          }
        : { value: tidy(props.initial.value), formula: props.initial.formula ?? '' },
    )
    setError(null)
    setOpen(true)
  }

  const save = async () => {
    // A characteristic can clear a field (blank -> null: it may price via a matrix instead); a line can't.
    const payload = isLine
      ? form
      : { value: form.value.trim() === '' ? null : form.value, formula: form.formula.trim() === '' ? null : form.formula }

    setSaving(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/product-families/${props.familyId}/${isLine ? 'lines' : 'characteristics'}/${props.itemId}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      )
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ? `${t('saveFailed')}: ${data.error}` : t('saveFailed'))
        return
      }
      showToast(t('pricingSaved', { name: props.itemName }))
      setOpen(false)
      router.refresh()
    } catch {
      setError(t('saveFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  const field = (key: string, label: string, opts?: { mono?: boolean; hint?: string }) => (
    <div className="space-y-1" key={key}>
      <Label htmlFor={`pf-edit-${key}`}>{label}</Label>
      <Input
        id={`pf-edit-${key}`}
        value={form[key] ?? ''}
        inputMode={key === 'formula' ? 'text' : 'decimal'}
        className={opts?.mono ? 'font-mono' : undefined}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
      {opts?.hint ? <p className="text-xs text-slate-400">{opts.hint}</p> : null}
    </div>
  )

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="ml-1.5 inline-flex rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-brand"
        aria-label={t('editItem', { name: props.itemName })}
        title={t('editItem', { name: props.itemName })}
      >
        <Pencil className="h-3 w-3" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-6"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-md overflow-auto rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{t('pricingTitle')}</p>
                <p className="text-xs text-slate-500">{props.itemName}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {field('value', t('fieldValue'))}
              {field('formula', t('fieldFormula'), { mono: true, hint: t('formulaHint') })}
              {isLine ? (
                <>
                  {field('discountPct', t('fieldDiscount'))}
                  {field('markupPct', t('fieldMarkup'), { hint: t('markupHint') })}
                  {field('installationHoursPerUnit', t('fieldInstallationHours'))}
                </>
              ) : (
                <p className="text-xs text-slate-400">{t('characteristicBlankHint')}</p>
              )}
            </div>

            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="button" disabled={saving} className="gap-2" onClick={() => void save()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? t('saving') : t('save')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
