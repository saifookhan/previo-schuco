'use client'

import * as Dialog from '@radix-ui/react-dialog'
import type { QuoteChange, QuoteRevision } from '@schuco/contracts'
import { Eye, Loader2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { EUR } from '@/lib/format'

type Scalar = QuoteChange['from']

const formatValue = (value: Scalar | undefined): string => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? '✓' : '✗'
  return String(value)
}

/** One change of a save, in words ("Finestre › P01: Q.tà 1 → 4"). */
const ChangeLine = ({ change }: { change: QuoteChange }) => {
  const t = useTranslations('quoteEditor')
  const field = change.field ? t.has(`changeField.${change.field}`) ? t(`changeField.${change.field}`) : change.field : ''
  const where = [change.family, change.line].filter(Boolean).join(' › ')
  const values = change.field && change.field !== 'productFamilyId' ? `: ${formatValue(change.from)} → ${formatValue(change.to)}` : ''
  return (
    <li className="text-[12px] text-slate-600">
      <span className="font-medium text-slate-700">{t(`changeKind.${change.kind}`)}</span>
      {where ? <span className="text-slate-500"> · {where}</span> : null}
      {field ? (
        <span>
          {' '}
          — {field}
          {values}
        </span>
      ) : null}
    </li>
  )
}

/** Every save of the open version, newest first, with what changed; any of them can be opened. */
export const QuoteHistoryPanel = ({
  open,
  onOpenChange,
  quoteId,
  versionId,
  revision,
  onView,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  quoteId: string
  versionId: string
  /** The version's current revision (reloads the list after a save). */
  revision: number
  onView: (revision: number) => void
}) => {
  const t = useTranslations('quoteEditor')
  const [revisions, setRevisions] = useState<QuoteRevision[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(false)
    fetch(`/api/sales-quotes/${quoteId}/versions/${versionId}/revisions`)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const data = (await response.json()) as { revisions: QuoteRevision[] }
        if (!cancelled) setRevisions(data.revisions)
      })
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [open, quoteId, versionId, revision])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/30" />
        <Dialog.Content className="fixed bottom-0 right-0 top-0 z-50 flex w-[min(96vw,440px)] flex-col bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <Dialog.Title className="text-[15px] font-semibold text-slate-800">{t('historyTitle')}</Dialog.Title>
            <Dialog.Close className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={t('close')}>
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="px-4 pt-2 text-[12px] text-slate-500">{t('historyHint')}</Dialog.Description>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {error ? <p className="text-[13px] text-red-600">{t('historyFailed')}</p> : null}
            {!revisions && !error ? <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-slate-400" /> : null}
            <ol className="space-y-3">
              {revisions?.map((entry) => (
                <li key={entry.revision} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-slate-800">
                        {entry.revision === revision ? t('revisionCurrent', { revision: entry.revision }) : t('revisionNumber', { revision: entry.revision })}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(entry.savedAt).toLocaleString('it-IT')} · {entry.savedBy?.name ?? t('unknownUser')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] tabular-nums text-slate-700">{EUR.format(Number(entry.totalPrice))}</span>
                      {entry.revision === revision ? null : (
                        <button
                          type="button"
                          onClick={() => onView(entry.revision)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-brand"
                          title={t('viewRevision')}
                          aria-label={t('viewRevision')}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {entry.fromVersion !== null ? <p className="mt-1 text-[12px] text-slate-500">{t('createdFromVersion', { version: entry.fromVersion })}</p> : null}
                  {entry.changes.length === 0 && entry.fromVersion === null ? <p className="mt-1 text-[12px] text-slate-400">{t('noChanges')}</p> : null}
                  {entry.changes.length > 0 ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {entry.changes.map((change, index) => (
                        <ChangeLine key={index} change={change} />
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
