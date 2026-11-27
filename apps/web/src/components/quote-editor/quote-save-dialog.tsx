'use client'

import * as Dialog from '@radix-ui/react-dialog'
import type { QuoteStatus } from '@schuco/contracts'
import { CopyPlus, Loader2, PencilLine, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * How to save: a draft can be fixed in place or saved as the next version of this alternative
 * only. An invoiced or accepted variant is never changed, so its edits become the next version.
 */
export const QuoteSaveDialog = ({
  open,
  onOpenChange,
  version,
  status,
  saving,
  error,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The open cell, e.g. V1A2. A new version copies only this alternative. */
  version: string
  status: QuoteStatus
  saving: boolean
  error: string | null
  onSave: (mode: 'update' | 'newVersion') => void
}) => {
  const t = useTranslations('quoteEditor')
  const ts = useTranslations('quotes.statusValue')
  const editable = status === 'draft'
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
        <Dialog.Content className="fixed left-1/2 top-[20vh] z-50 w-[min(94vw,460px)] -translate-x-1/2 rounded-xl bg-white p-5 shadow-xl">
          <div className="mb-1 flex items-center justify-between">
            <Dialog.Title className="text-[15px] font-semibold text-slate-800">{t('saveTitle')}</Dialog.Title>
            <Dialog.Close className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={t('close')}>
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-4 text-[13px] text-slate-500">
            {editable ? t('saveDraftHint', { version }) : t('saveLockedHint', { version, status: ts(status) })}
          </Dialog.Description>
          <div className="space-y-2">
            {editable ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => onSave('update')}
                className="flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-brand hover:bg-blue-50 disabled:opacity-50"
              >
                <PencilLine className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
                <span>
                  <span className="block text-[13px] font-semibold text-slate-800">{t('saveUpdate', { version })}</span>
                  <span className="block text-[12px] text-slate-500">{t('saveUpdateHint')}</span>
                </span>
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave('newVersion')}
              className="flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-brand hover:bg-blue-50 disabled:opacity-50"
            >
              <CopyPlus className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
              <span>
                <span className="block text-[13px] font-semibold text-slate-800">{t('saveNewVersion')}</span>
                <span className="block text-[12px] text-slate-500">{t('saveNewVersionHint', { version })}</span>
              </span>
            </button>
          </div>
          {saving ? (
            <p className="mt-3 flex items-center gap-2 text-[12px] text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('saving')}
            </p>
          ) : null}
          {error ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
