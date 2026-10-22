'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { CalendarRange, Loader2, Pencil } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import { priceValidityStatus } from '@schuco/contracts'

interface PriceValidity {
  priceValidFrom: string | null
  priceValidTo: string | null
}

/** A `YYYY-MM-DD` day as a Date at UTC midnight — format it with `timeZone: 'UTC'` so it never shifts a day. */
const asDay = (day: string) => new Date(`${day}T00:00:00Z`)

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
        setError(data.error ? `${t('saveFailed')}: ${data.error}` : t('saveFailed'))
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

/** Compact validity for the families table: one date per line, status badge under them. */
export const PriceValidityCell = ({
  validity: { priceValidFrom, priceValidTo },
  today,
}: {
  validity: PriceValidity
  today: string
}) => {
  const t = useTranslations('priceValidity')
  const format = useFormatter()
  const day = (value: string) => format.dateTime(asDay(value), { dateStyle: 'medium', timeZone: 'UTC' })
  const lines =
    priceValidFrom && priceValidTo
      ? [`${day(priceValidFrom)} –`, day(priceValidTo)]
      : priceValidFrom
        ? [t('fromOnlyShort', { from: day(priceValidFrom) })]
        : priceValidTo
          ? [t('toOnlyShort', { to: day(priceValidTo) })]
          : ['—']
  return (
    <div className="space-y-1 text-slate-600">
      {lines.map((line) => (
        <p key={line} className="whitespace-nowrap">
          {line}
        </p>
      ))}
      <PriceValidityBadge validity={{ priceValidFrom, priceValidTo }} today={today} />
    </div>
  )
}
