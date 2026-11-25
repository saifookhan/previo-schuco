'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { CalendarRange, Loader2, Pencil } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

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
 * Dates just saved from the table, per family, until the refreshed page brings them back — the
 * two date cells of a row save both dates, so the second must not send the first's old value.
 */
const savedDates = new Map<string, PriceValidity>()
/** The save in progress per family, which the next one waits for. */
const saveQueue = new Map<string, Promise<void>>()

/**
 * "Valid from" or "Valid to" as a date field right in the families table, for the family's owner.
 * Saves when the field is left (or on Enter) — not on every change, since typing a year fires
 * one for each digit. "Valid from" can't be emptied; emptying "Valid to" means until further notice.
 */
export const PriceValidityDateInput = ({
  familyId,
  familyName,
  field,
  validity,
  today,
  canEdit,
}: {
  familyId: string
  familyName: string
  field: 'priceValidFrom' | 'priceValidTo'
  validity: PriceValidity
  today: string
  /** False for families shared by another company — only the owner changes the dates. */
  canEdit: boolean
}) => {
  const t = useTranslations('priceValidity')
  const saveError = useValiditySaveError()
  const format = useFormatter()
  const { can } = useAuth()
  const router = useRouter()
  const { startTransition } = useLoadingTransition()
  const saved = validity[field] ?? ''
  const [value, setValue] = useState(saved)
  const [saving, setSaving] = useState(false)
  // Enter saves, then disabling the field blurs it — this keeps that from saving twice.
  const inFlight = useRef(false)
  // What the server has, including a save the refreshed page hasn't brought back yet.
  const committed = useRef(saved)
  useEffect(() => {
    committed.current = saved
    setValue(saved)
  }, [saved])
  // Fresh dates from the server replace what was saved meanwhile.
  useEffect(() => {
    savedDates.delete(familyId)
  }, [familyId, validity.priceValidFrom, validity.priceValidTo])

  const save = async (next: string) => {
    if (next === committed.current || inFlight.current) return
    inFlight.current = true
    setSaving(true)
    // One save at a time per family, so each sends the dates the previous one left.
    const previous = saveQueue.get(familyId) ?? Promise.resolve()
    const run = previous.then(() => send(next))
    saveQueue.set(familyId, run)
    try {
      await run
    } finally {
      if (saveQueue.get(familyId) === run) saveQueue.delete(familyId)
      inFlight.current = false
      setSaving(false)
    }
  }

  const send = async (next: string) => {
    const current = savedDates.get(familyId) ?? validity
    const dates: PriceValidity = { priceValidFrom: current.priceValidFrom, priceValidTo: current.priceValidTo, [field]: next || null }
    const problem = !dates.priceValidFrom
      ? t('validFromRequired')
      : dates.priceValidTo && dates.priceValidTo < dates.priceValidFrom
        ? t('validToBeforeFrom')
        : null
    if (problem) {
      setValue(committed.current)
      showToast(`${familyName}: ${problem}`, 'error')
      return
    }
    try {
      const response = await fetch(`/api/product-families/${familyId}/price-validity`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dates),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setValue(committed.current)
        showToast(`${familyName}: ${saveError(data, t('saveFailed'))}`, 'error')
        return
      }
      committed.current = next
      savedDates.set(familyId, dates)
      startTransition(() => router.refresh())
    } catch {
      setValue(committed.current)
      showToast(t('saveFailedUnreachable'), 'error')
    }
  }


  // The status sits under "Valid to", so it shows once per row.
  const badge = field === 'priceValidTo' ? <PriceValidityBadge validity={validity} today={today} /> : null

  if (!canEdit || !can('catalog.edit')) {
    return (
      <div className="space-y-1 text-slate-600">
        <p className="whitespace-nowrap">{saved ? format.dateTime(asDay(saved), { dateStyle: 'medium', timeZone: 'UTC' }) : '—'}</p>
        {badge}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Input
        type="date"
        aria-label={t(field === 'priceValidFrom' ? 'validFromOf' : 'validToOf', { name: familyName })}
        className="h-8 w-[8.5rem] px-1.5 text-sm"
        required={field === 'priceValidFrom'}
        min={field === 'priceValidTo' ? validity.priceValidFrom || undefined : undefined}
        max={field === 'priceValidFrom' ? validity.priceValidTo || undefined : undefined}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save(value)}
        onKeyDown={(e) => (e.key === 'Enter' ? void save(value) : undefined)}
      />
      {badge}
    </div>
  )
}
