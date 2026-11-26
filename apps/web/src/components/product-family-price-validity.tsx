'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { CalendarRange, Loader2, Pencil } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLoadingTransition } from '@/components/ui/loading-region'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import { priceValidityStatus, type PriceValidity, type PriceValidityOverlapResponse } from '@schuco/contracts'

/** A `YYYY-MM-DD` day as a Date at UTC midnight — format it with `timeZone: 'UTC'` so it never shifts a day. */
const asDay = (day: string) => new Date(`${day}T00:00:00Z`)

/**
 * Says why a validity save failed: another version already covering some of the days (the
 * server's 409 names it), else the server's own error after `fallback`.
 */
export const useValiditySaveError = () => {
  const t = useTranslations('priceValidity')
  const format = useFormatter()
  const day = (value: string | null) => (value ? format.dateTime(asDay(value), { dateStyle: 'medium', timeZone: 'UTC' }) : '…')
  return (data: { error?: string } | Partial<PriceValidityOverlapResponse>, fallback: string): string =>
    'overlap' in data && data.overlap
      ? t('overlapsVersion', { version: data.overlap.version, from: day(data.overlap.priceValidFrom), to: day(data.overlap.priceValidTo) })
      : data.error
        ? `${fallback}: ${data.error}`
        : fallback
}

/** "Prices valid 1 Jan 2027 – 31 Dec 2027", "Prices valid from 1 Jan 2027", or null when the family has no dates. */
export const usePriceValidityLabel = () => {
  const t = useTranslations('priceValidity')
  const format = useFormatter()
  const day = (value: string) => format.dateTime(asDay(value), { dateStyle: 'medium', timeZone: 'UTC' })
  return ({ priceValidFrom, priceValidTo }: PriceValidity): string | null => {
    if (priceValidFrom && priceValidTo) return t('range', { from: day(priceValidFrom), to: day(priceValidTo) })
    if (priceValidFrom) return t('fromOnly', { from: day(priceValidFrom) })
    if (priceValidTo) return t('toOnly', { to: day(priceValidTo) })
    return null
  }
}

/**
 * "Upcoming" / "Expired" badge; nothing while the prices are current. `today` comes from the
 * server page so the server render and hydration agree even around midnight.
 */
export const PriceValidityBadge = ({ validity, today }: { validity: PriceValidity; today: string }) => {
  const t = useTranslations('priceValidity')
  const status = priceValidityStatus(validity, today)
  if (status === 'current') return null
  return <Badge variant={status === 'expired' ? 'danger' : 'warning'}>{t(status)}</Badge>
}

/**
 * The family's price validity on its detail page, with an "Edit" dialog for
 * whoever may manage the family. Positions already on quotes keep their prices.
 */
export const ProductFamilyPriceValidity = ({
  familyId,
  validity,
  canEdit,
  today,
}: {
  familyId: string
  validity: PriceValidity
  canEdit: boolean
  /** `priceValidityToday()` from the server page — see `PriceValidityBadge`. */
  today: string
}) => {
  const t = useTranslations('priceValidity')
  const saveError = useValiditySaveError()
  const label = usePriceValidityLabel()
  const router = useRouter()
  const { can } = useAuth()
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(validity.priceValidFrom ?? '')
  const [to, setTo] = useState(validity.priceValidTo ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dateError = !from ? t('validFromRequired') : to && to < from ? t('validToBeforeFrom') : null

  const openDialog = () => {
    setFrom(validity.priceValidFrom ?? '')
    setTo(validity.priceValidTo ?? '')
    setError(null)
    setOpen(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (dateError) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/product-families/${familyId}/price-validity`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceValidFrom: from, priceValidTo: to || null }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(saveError(data, t('saveFailed')))
        return
      }
      setOpen(false)
      showToast(t('saved'))
      router.refresh()
    } catch {
      setError(t('saveFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
      <CalendarRange className="h-4 w-4 text-slate-400" />
      <span>{label(validity) ?? t('notSet')}</span>
      <PriceValidityBadge validity={validity} today={today} />
      {canEdit && can('catalog.edit') ? (
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={openDialog}>
          <Pencil className="h-3 w-3" />
          {t('edit')}
        </Button>
      ) : null}

      <Dialog.Root open={open} onOpenChange={(next) => (!saving ? setOpen(next) : undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl focus:outline-none">
            <form onSubmit={(e) => void save(e)} className="space-y-4">
              <div>
                <Dialog.Title className="text-lg font-semibold text-slate-900">{t('editTitle')}</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-slate-500">{t('editHint')}</Dialog.Description>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="validity-from">{t('validFrom')}</Label>
                  <Input id="validity-from" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="validity-to">{t('validTo')}</Label>
                  <Input id="validity-to" type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-slate-500">{t('validToHint')}</p>
              {dateError && (to || !from) ? <p className="text-xs text-red-600">{dateError}</p> : null}
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline" disabled={saving}>
                    {t('cancel')}
                  </Button>
                </Dialog.Close>
                <Button type="submit" className="gap-2" disabled={saving || dateError !== null}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {saving ? t('saving') : t('save')}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

/**
 * Both validity dates, edited together in the expanded list row. One save sends both, so the
 * two fields can't overwrite each other. "Valid from" can't be emptied; emptying "Valid to"
 * means until further notice. Someone who may not edit the family sees the dates as text.
 */
export const PriceValidityFields = ({
  familyId,
  familyName,
  validity,
  canEdit,
}: {
  familyId: string
  familyName: string
  validity: PriceValidity
  /** False for families shared by another company — only the owner changes the dates. */
  canEdit: boolean
}) => {
  const t = useTranslations('priceValidity')
  const saveError = useValiditySaveError()
  const format = useFormatter()
  const { can } = useAuth()
  const router = useRouter()
  const { startTransition } = useLoadingTransition()
  const [from, setFrom] = useState(validity.priceValidFrom ?? '')
  const [to, setTo] = useState(validity.priceValidTo ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setFrom(validity.priceValidFrom ?? '')
    setTo(validity.priceValidTo ?? '')
    setError(null)
  }, [validity.priceValidFrom, validity.priceValidTo])

  const day = (value: string | null) => (value ? format.dateTime(asDay(value), { dateStyle: 'medium', timeZone: 'UTC' }) : '—')
  const dateError = !from ? t('validFromRequired') : to && to < from ? t('validToBeforeFrom') : null
  // A family with no dates opens quietly. The message appears once the dates are changed, or when they already contradict each other.
  const changed = from !== (validity.priceValidFrom ?? '') || to !== (validity.priceValidTo ?? '')
  const showDateError = dateError !== null && (changed || Boolean(from && to && to < from))
  const editable = canEdit && can('catalog.edit')

  const save = async () => {
    if (dateError) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/product-families/${familyId}/price-validity`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceValidFrom: from, priceValidTo: to || null }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(saveError(data, t('saveFailed')))
        return
      }
      showToast(t('saved'))
      startTransition(() => router.refresh())
    } catch {
      setError(t('saveFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  if (!editable) {
    return (
      <div className="flex flex-wrap gap-6 text-sm text-slate-600">
        <div>
          <p className="text-xs text-slate-500">{t('validFrom')}</p>
          <p>{day(validity.priceValidFrom)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t('validTo')}</p>
          <p>{day(validity.priceValidTo)}</p>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="space-y-2"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={`validity-from-${familyId}`}>{t('validFrom')}</Label>
          <Input
            id={`validity-from-${familyId}`}
            type="date"
            required
            aria-label={t('validFromOf', { name: familyName })}
            className="h-8 w-[10.5rem]"
            max={to || undefined}
            value={from}
            disabled={saving}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`validity-to-${familyId}`}>{t('validTo')}</Label>
          <Input
            id={`validity-to-${familyId}`}
            type="date"
            aria-label={t('validToOf', { name: familyName })}
            className="h-8 w-[10.5rem]"
            min={from || undefined}
            value={to}
            disabled={saving}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={saving || dateError !== null}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
      <p className="text-xs text-slate-500">{t('validToHint')}</p>
      {showDateError ? <p className="text-xs text-red-600">{dateError}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  )
}
