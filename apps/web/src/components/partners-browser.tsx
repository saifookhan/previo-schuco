'use client'

import { Check, Clock, Loader2, Plus, Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePartnerAction } from '@/hooks/use-partner-action'
import type { PartnerDto, PartnerStatus } from '@schuco/contracts'

const STATUS_BADGE: Record<PartnerStatus, 'muted' | 'warning' | 'default' | 'success'> = {
  none: 'muted',
  sent: 'warning',
  received: 'default',
  connected: 'success',
}

/** Two letters for the avatar: the first letters of the first two words, leaving out "S.r.l."-style suffixes. */
const initialsOf = (name: string): string => {
  const words = name.split(/\s+/).filter((word) => /^[\p{L}\p{N}]/u.test(word) && !word.includes('.'))
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? name).slice(0, 2)
  return letters.toUpperCase()
}

/** What can be done with one company, by connection status. */
const PartnerActions = ({ company }: { company: PartnerDto }) => {
  const t = useTranslations('partners')
  const { run, busy } = usePartnerAction()
  const [confirming, setConfirming] = useState(false)
  const spinner = (action: string) => (busy === action ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null)

  switch (company.status) {
    case 'none':
      return (
        <Button type="button" size="sm" disabled={busy !== null} onClick={() => void run(company, 'request')}>
          {spinner('request') ?? <Plus className="h-3.5 w-3.5" />}
          {t('connect')}
        </Button>
      )
    case 'sent':
      return (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{t('requestSent')}</span>
          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void run(company, 'remove', 'sent')}>
            {spinner('remove')}
            {t('withdraw')}
          </Button>
        </div>
      )
    case 'received':
      return (
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" disabled={busy !== null} onClick={() => void run(company, 'accept')}>
            {spinner('accept') ?? <Check className="h-3.5 w-3.5" />}
            {t('accept')}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void run(company, 'reject')}>
            {spinner('reject')}
            {t('reject')}
          </Button>
        </div>
      )
    case 'connected':
      return (
        <>
          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setConfirming(true)}>
            {spinner('remove') ?? <X className="h-3.5 w-3.5" />}
            {t('remove')}
          </Button>
          <ConfirmDialog
            open={confirming}
            title={t('removeTitle', { name: company.name })}
            description={t('removeDescription')}
            confirmLabel={t('remove')}
            cancelLabel={t('cancel')}
            busy={busy !== null}
            onCancel={() => setConfirming(false)}
            onConfirm={() => void run(company, 'remove', 'connected').then(() => setConfirming(false))}
          />
        </>
      )
  }
}

const PartnerCard = ({ company }: { company: PartnerDto }) => {
  const t = useTranslations('partners')
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-600"
          aria-hidden="true"
        >
          {initialsOf(company.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900" title={company.name}>
            {company.name}
          </p>
          {company.address ? <p className="mt-0.5 text-xs text-slate-500">{company.address}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex-1">
        <Badge variant={STATUS_BADGE[company.status]} className="gap-1 font-medium">
          {company.status === 'connected' ? <Check className="h-3 w-3" /> : null}
          {company.status === 'sent' ? <Clock className="h-3 w-3" /> : null}
          {t(`status.${company.status}`)}
        </Badge>
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <PartnerActions company={company} />
      </div>
    </div>
  )
}

/** Matches the company name, its branch names and its address. */
const matches = (company: PartnerDto, query: string): boolean => {
  const q = query.trim().toLocaleLowerCase()
  return !q || [company.name, company.address ?? '', ...company.branches].some((text) => text.toLocaleLowerCase().includes(q))
}

/** The companies of one tab, with search. Companies waiting for an answer come first, then connected ones. */
export const PartnersBrowser = ({ companies, tab }: { companies: PartnerDto[]; tab: 'clients' | 'suppliers' }) => {
  const t = useTranslations('partners')
  const [query, setQuery] = useState('')
  const order: Record<PartnerStatus, number> = { received: 0, sent: 1, connected: 2, none: 3 }
  const shown = companies
    .filter((company) => matches(company, query))
    .sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name))

  return (
    <div>
      <div className="relative mb-5 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('search')}
          className="pl-9"
        />
      </div>
      <p className="font-semibold text-slate-900">{t(tab === 'clients' ? 'clientsCount' : 'suppliersCount', { count: shown.length })}</p>
      <p className="mb-4 text-sm text-slate-500">{t(tab === 'clients' ? 'clientsHint' : 'suppliersHint')}</p>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
          {companies.length === 0 ? t('empty') : t('noMatches')}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {shown.map((company) => (
            <PartnerCard key={company.id} company={company} />
          ))}
        </div>
      )}
    </div>
  )
}
