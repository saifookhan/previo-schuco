'use client'

import { ChevronDown, History, Loader2 } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { AuditLogEntry, AuditLogListResponse } from '@schuco/contracts'

type Metadata = Record<string, unknown>

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined)

/**
 * "Who changed what, when" for one record (a quote, a product family), built from
 * its audit entries. Collapsed until opened — nothing is fetched before that.
 * While open, a change of `refreshKey` (e.g. the record's `updatedAt`) reloads it.
 */
export const RecordHistory = ({
  endpoint,
  itemNames = {},
  refreshKey,
}: {
  /** Web API route returning an `AuditLogListResponse`, e.g. `/api/sales-quotes/<id>/history`. */
  endpoint: string
  /** Names for ids that appear in entries (product lines, options, price tables). */
  itemNames?: Record<string, string>
  refreshKey?: string
}) => {
  const t = useTranslations('recordHistory')
  const format = useFormatter()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const latestRequest = useRef(0)

  const load = useCallback(
    async (cursor?: string) => {
      const requestNumber = ++latestRequest.current
      const isCurrent = () => requestNumber === latestRequest.current
      setLoading(true)
      setError(false)
      try {
        const response = await fetch(cursor ? `${endpoint}?cursor=${encodeURIComponent(cursor)}` : endpoint, { cache: 'no-store' })
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
        if (isCurrent()) setLoading(false)
      }
    },
    [endpoint],
  )

  useEffect(() => {
    if (open) {
      void load()
    }
  }, [open, refreshKey, load])

  const who = (entry: AuditLogEntry): string => {
    if (entry.actorType === 'system') return t('system')
    if (!entry.actor) return t('anonymous')
    return entry.actor.name ?? entry.actor.email ?? t('unknownUser')
  }

  const fieldList = (changed: unknown): string =>
    Array.isArray(changed)
      ? changed.map((field) => (t.has(`fields.${String(field)}`) ? t(`fields.${String(field)}`) : String(field))).join(', ')
      : ''

  /** One readable sentence per entry; unknown actions fall back to the raw action code. */
  const describe = (entry: AuditLogEntry): string => {
    const meta = (entry.metadata ?? {}) as Metadata
    const key = entry.action.replaceAll('.', '_')
    if (!t.has(`actions.${key}`)) {
      return entry.action
    }
    // Older family edits were filed under the item's own id instead of carrying `itemId`.
    const itemId = text(meta.itemId) ?? entry.resourceId ?? ''
    return t(`actions.${key}`, {
      code: text(meta.positionCode) ?? 'none',
      reference: text(meta.reference) ?? 'none',
      fileName: text(meta.fileName) ?? 'none',
      version: typeof meta.version === 'number' ? meta.version : 0,
      item: itemNames[itemId] ?? 'none',
      fields: fieldList(meta.changed),
      count: typeof meta.shareCount === 'number' ? meta.shareCount : 0,
      reason: text(meta.reason) ?? 'none',
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-500" />
          {t('title')}
        </CardTitle>
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? t('hide') : t('show')}
          <ChevronDown className={cn('ml-1 h-4 w-4 transition-transform', open && 'rotate-180')} />
        </Button>
      </CardHeader>
      {open ? (
        <CardContent>
          {error ? <p className="text-sm text-red-600">{t('errorLoading')}</p> : null}
          {!error && !loading && entries.length === 0 ? <p className="text-sm text-slate-500">{t('empty')}</p> : null}
          <ol className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand/60" aria-hidden />
                <div className="min-w-0">
                  <p className="text-slate-900">{describe(entry)}</p>
                  <p className="text-xs text-slate-500">
                    {who(entry)} · {format.dateTime(new Date(entry.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex justify-center">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            ) : nextCursor ? (
              <Button variant="outline" size="sm" onClick={() => void load(nextCursor)}>
                {t('loadMore')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      ) : null}
    </Card>
  )
}
