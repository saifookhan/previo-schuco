'use client'

import { AlertTriangle, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingRegion } from '@/components/ui/loading-region'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { AuditLogEntry, AuditLogListResponse } from '@schuco/contracts'

const RESOURCE_TYPES = ['user', 'company', 'product_family', 'quote', 'role', 'role_permissions'] as const

interface Filters {
  companyId: string
  resourceType: string
  from: string
  to: string
  requestId: string
  actor: { id: string; label: string } | null
}

const EMPTY_FILTERS: Filters = { companyId: '', resourceType: '', from: '', to: '', requestId: '', actor: null }

/** Light (company settings) vs dark (platform admin panel) styling — the two shells use different palettes. */
const TONES = {
  light: {
    title: 'text-slate-900',
    muted: 'text-slate-500',
    text: 'text-slate-700',
    border: 'border-slate-200',
    rowHover: 'hover:bg-slate-50',
    code: 'bg-slate-100 text-slate-700',
    card: '',
    select: 'border-slate-300 bg-white text-slate-900',
    input: '',
    outlineButton: '',
    error: 'border-red-200 bg-red-50 text-red-700',
  },
  dark: {
    title: 'text-white',
    muted: 'text-slate-400',
    text: 'text-slate-300',
    border: 'border-slate-800',
    rowHover: 'hover:bg-slate-800/30',
    code: 'bg-slate-800 text-slate-200',
    card: 'border-slate-800 bg-slate-900',
    select: 'border-slate-700 bg-slate-950 text-slate-100 [color-scheme:dark]',
    input: 'border-slate-700 bg-slate-950 text-slate-100 [color-scheme:dark]',
    outlineButton: 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800',
    error: 'border-red-900 bg-red-950/50 text-red-300',
  },
} as const

/** Start of a calendar day picked in `<input type="date">`, in the viewer's own time zone, as an ISO instant. */
const localDayStart = (day: string, addDays = 0): string => {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date + addDays).toISOString()
}

const buildQuery = (scope: 'company' | 'platform', filters: Filters, cursor?: string): string => {
  const params = new URLSearchParams({ scope })
  if (filters.companyId) params.set('companyId', filters.companyId)
  if (filters.resourceType) params.set('resourceType', filters.resourceType)
  // The API's range is [from, to): send local midnights so "to 18 Oct" means the end of the 18th here, not in UTC.
  if (filters.from) params.set('from', localDayStart(filters.from))
  if (filters.to) params.set('to', localDayStart(filters.to, 1))
  if (filters.requestId.trim()) params.set('requestId', filters.requestId.trim())
  if (filters.actor) params.set('actorUserId', filters.actor.id)
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

/**
 * Read-only audit log: who did what, when, to which record. Company admins
 * see their own company; super-admins see every company and can narrow by one.
 * Click a person to see only their actions; open a row for its details.
 */
export const AuditLogViewer = ({
  tone,
  companies,
}: {
  tone: keyof typeof TONES
  /** Super-admin only (admin panel): offers the company filter and shows every company. Without it the viewer shows only the current company. */
  companies?: { id: string; name: string }[]
}) => {
  const scope = companies ? 'platform' : 'company'
  const t = useTranslations('auditLog')
  const tLoading = useTranslations('loading')
  const format = useFormatter()
  const styles = TONES[tone]

  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS)
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  /** `replace`: new filters (or the first load) — the table shows its loading state; `more`: "Load more" — a spinner under the rows (ADR 0014). */
  const [loading, setLoading] = useState<false | 'replace' | 'more'>('replace')
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Only the newest request may update the table — an older one (previous filter, a slow "load more")
  // that answers late is dropped instead of mixing its rows into the current view.
  const latestRequest = useRef(0)

  const load = useCallback(
    async (filters: Filters, cursor?: string) => {
      const requestNumber = ++latestRequest.current
      const isCurrent = () => requestNumber === latestRequest.current
      setLoading(cursor ? 'more' : 'replace')
      setError(false)
      // New filters: the old cursor belongs to the previous query, so "Load more" can't use it.
      if (!cursor) setNextCursor(null)
      try {
        const response = await fetch(`/api/audit-log?${buildQuery(scope, filters, cursor)}`, { cache: 'no-store' })
        if (!isCurrent()) return
        if (!response.ok) {
          setError(true)
          return
        }
        const page = (await response.json()) as AuditLogListResponse
        if (!isCurrent()) return
        setEntries((current) => (cursor ? [...current, ...page.entries] : page.entries))
        setNextCursor(page.nextCursor)
      } catch {
        if (isCurrent()) setError(true)
      } finally {
        if (isCurrent()) {
          setLoading(false)
          setLoadedOnce(true)
        }
      }
    },
    [scope],
  )

  useEffect(() => {
    void load(applied)
  }, [applied, load])

  const apply = (filters: Filters) => {
    setDraft(filters)
    setApplied(filters)
    setExpanded(new Set())
  }

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

  const actorLabel = (entry: AuditLogEntry): string => {
    if (entry.actorType === 'system') return t('system')
    if (!entry.actor) return t('anonymous')
    return entry.actor.name ?? entry.actor.email ?? t('unknownUser')
  }

  const selectClass = cn('h-9 w-full rounded-md border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand', styles.select)

  return (
    <div className="space-y-6">
      <Card className={styles.card}>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-6">
          {companies ? (
            <div className="space-y-1 lg:col-span-2">
              <Label className={styles.muted}>{t('company')}</Label>
              <select
                className={selectClass}
                value={draft.companyId}
                onChange={(e) => setDraft({ ...draft, companyId: e.target.value })}
              >
                <option value="">{t('allCompanies')}</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label className={styles.muted}>{t('resourceType')}</Label>
            <select
              className={selectClass}
              value={draft.resourceType}
              onChange={(e) => setDraft({ ...draft, resourceType: e.target.value })}
            >
              <option value="">{t('allTypes')}</option>
              {RESOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`resourceTypes.${type}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className={styles.muted}>{t('from')}</Label>
            <Input type="date" className={styles.input} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className={styles.muted}>{t('to')}</Label>
            <Input type="date" className={styles.input} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className={styles.muted}>{t('requestId')}</Label>
            <Input
              className={styles.input}
              value={draft.requestId}
              placeholder={t('requestIdPlaceholder')}
              onChange={(e) => setDraft({ ...draft, requestId: e.target.value })}
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
            <Button onClick={() => apply(draft)} disabled={loading !== false}>
              {t('apply')}
            </Button>
            <Button variant="outline" className={styles.outlineButton} onClick={() => apply(EMPTY_FILTERS)} disabled={loading !== false}>
              {t('reset')}
            </Button>
            {applied.actor ? (
              <span className={cn('ml-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs', styles.code)}>
                {t('onlyActor', { name: applied.actor.label })}
                <button type="button" aria-label={t('clearActor')} onClick={() => apply({ ...applied, actor: null })}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className={cn('flex items-center gap-2 rounded-lg border px-4 py-3 text-sm', styles.error)}>
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {t('errorLoading')}
        </div>
      ) : null}

      {!loadedOnce ? (
        <TableSkeleton columns={6} tone={tone} label={tLoading('loading')} />
      ) : (
        <LoadingRegion pending={loading === 'replace'} tone={tone}>
          <Card className={styles.card}>
            <CardHeader>
              <CardTitle className={styles.title}>{t('entriesShown', { count: entries.length })}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className={cn('border-b text-left', styles.border, styles.muted)}>
                    <th className="w-8 px-4 py-3" />
                    <th className="px-4 py-3 font-medium">{t('when')}</th>
                    <th className="px-4 py-3 font-medium">{t('who')}</th>
                    <th className="px-4 py-3 font-medium">{t('company')}</th>
                    <th className="px-4 py-3 font-medium">{t('action')}</th>
                    <th className="px-4 py-3 font-medium">{t('resource')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const isOpen = expanded.has(entry.id)
                    const viaOtherCompany = entry.actorCompany && entry.actorCompany.id !== entry.company.id
                    return (
                      <Fragment key={entry.id}>
                        <tr className={cn('border-b align-top', styles.border, styles.rowHover)}>
                          <td className="px-4 py-3">
                            <button type="button" aria-label={t('details')} onClick={() => toggle(entry.id)} className={styles.muted}>
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </td>
                          <td className={cn('whitespace-nowrap px-4 py-3', styles.text)}>
                            {format.dateTime(new Date(entry.createdAt), { dateStyle: 'short', timeStyle: 'medium' })}
                          </td>
                          <td className="px-4 py-3">
                            {entry.actor ? (
                              <button
                                type="button"
                                className={cn('text-left hover:underline', styles.title)}
                                title={t('filterByActor')}
                                onClick={() => apply({ ...applied, actor: { id: entry.actor!.id, label: actorLabel(entry) } })}
                              >
                                {actorLabel(entry)}
                              </button>
                            ) : (
                              <span className={styles.muted}>{actorLabel(entry)}</span>
                            )}
                            {entry.actor?.email && entry.actor.name ? <div className={cn('text-xs', styles.muted)}>{entry.actor.email}</div> : null}
                          </td>
                          <td className={cn('px-4 py-3', styles.text)}>
                            {entry.company.name ?? entry.company.id.slice(0, 8)}
                            {viaOtherCompany ? (
                              <div className={cn('text-xs', styles.muted)}>
                                {t('viaCompany', { name: entry.actorCompany!.name ?? entry.actorCompany!.id.slice(0, 8) })}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <code className={cn('rounded px-1.5 py-0.5 font-mono text-xs', styles.code)}>{entry.action}</code>
                          </td>
                          <td className={cn('px-4 py-3', styles.text)}>
                            {t.has(`resourceTypes.${entry.resourceType}`) ? t(`resourceTypes.${entry.resourceType}`) : entry.resourceType}
                            {entry.resourceId ? <div className={cn('font-mono text-xs', styles.muted)}>{entry.resourceId}</div> : null}
                          </td>
                        </tr>
                        {isOpen ? (
                          <tr className={cn('border-b', styles.border)}>
                            <td />
                            <td colSpan={5} className="px-4 pb-4">
                              <dl className={cn('grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]', styles.text)}>
                                <dt className={styles.muted}>{t('requestId')}</dt>
                                <dd className="font-mono">{entry.requestId ?? '—'}</dd>
                                {entry.jobId ? (
                                  <>
                                    <dt className={styles.muted}>{t('jobId')}</dt>
                                    <dd className="font-mono">{entry.jobId}</dd>
                                  </>
                                ) : null}
                                <dt className={styles.muted}>{t('details')}</dt>
                                <dd>
                                  {entry.metadata ? (
                                    <pre className={cn('overflow-x-auto rounded p-2 font-mono', styles.code)}>
                                      {JSON.stringify(entry.metadata, null, 2)}
                                    </pre>
                                  ) : (
                                    '—'
                                  )}
                                </dd>
                              </dl>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
              {loading === false && entries.length === 0 && !error ? <p className={cn('px-6 py-8 text-sm', styles.muted)}>{t('empty')}</p> : null}
              <div className="flex justify-center p-4">
                {loading === 'more' ? (
                  <Loader2 className={cn('h-5 w-5 animate-spin', styles.muted)} />
                ) : loading === false && nextCursor ? (
                  <Button variant="outline" className={styles.outlineButton} onClick={() => void load(applied, nextCursor)}>
                    {t('loadMore')}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </LoadingRegion>
      )}
    </div>
  )
}
