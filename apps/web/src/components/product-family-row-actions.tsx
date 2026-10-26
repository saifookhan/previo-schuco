'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Copy, Loader2, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  ProductFamilyDetailsFields,
  useProductFamilyDetailsError,
  type ProductFamilyDetails,
} from '@/components/product-family-details-fields'
import { Button } from '@/components/ui/button'
import { useLoadingTransition } from '@/components/ui/loading-region'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import { priceValidityStatus, priceValidityToday } from '@schuco/contracts'

interface ProductFamilyRowActionsProps {
  familyId: string
  familyName: string
  isPublished: boolean
  /** The family's dates, which the copy dialog starts from. */
  validity: { priceValidFrom: string | null; priceValidTo: string | null }
  /** Where to navigate after a successful delete. Omit to just refresh in place (list page); pass the list route from the detail page, since staying put would 404. */
  redirectAfterDeleteHref?: string
}

/**
 * Publish/unpublish toggle + duplicate + delete, shared by the list and detail pages.
 * Duplicate opens a dialog for the copy's name, price validity and publish choice first.
 */
export const ProductFamilyRowActions = ({
  familyId,
  familyName,
  isPublished,
  validity,
  redirectAfterDeleteHref,
}: ProductFamilyRowActionsProps) => {
  const t = useTranslations('productFamilyActions')
  const router = useRouter()
  // Refreshes run in the table's loading region, so the list shows it is reloading (ADR 0014).
  const { startTransition } = useLoadingTransition()
  const { user, can } = useAuth()
  const [busyAction, setBusyAction] = useState<'publish' | 'duplicate' | 'delete' | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [copyDetails, setCopyDetails] = useState<ProductFamilyDetails | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const detailsError = useProductFamilyDetailsError()
  const copyDateError = copyDetails ? detailsError(copyDetails) : null

  if (!user || !can('catalog.edit')) {
    return null
  }

  const togglePublish = async () => {
    setBusyAction('publish')
    try {
      await fetch(`/api/product-families/${familyId}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !isPublished }),
      })
      startTransition(() => router.refresh())
    } finally {
      setBusyAction(null)
    }
  }

  const openCopyDialog = () => {
    setCopyError(null)
    const today = priceValidityToday()
    // An expired range would make a copy nobody can quote from, so it starts from today instead.
    const expired = priceValidityStatus(validity, today) === 'expired'
    setCopyDetails({
      name: t('copyName', { name: familyName }).slice(0, 200),
      priceValidFrom: expired ? today : (validity.priceValidFrom ?? today),
      priceValidTo: expired ? '' : (validity.priceValidTo ?? ''),
      publish: false,
    })
  }

  const duplicate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!copyDetails || copyDateError) {
      return
    }
    setBusyAction('duplicate')
    setCopyError(null)
    try {
      const response = await fetch(`/api/product-families/${familyId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: copyDetails.name,
          priceValidFrom: copyDetails.priceValidFrom,
          priceValidTo: copyDetails.priceValidTo || null,
          publish: copyDetails.publish,
        }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string; family?: { id: string; name: string } }
      if (!response.ok || !data.family) {
        setCopyError(data.error ? `${t('duplicateFailed')}: ${data.error}` : t('duplicateFailed'))
        // The family may be gone (deleted elsewhere) — let the page behind the dialog catch up.
        startTransition(() => router.refresh())
        return
      }
      setCopyDetails(null)
      showToast(t('duplicateSuccess', { name: data.family.name }))
      router.push(`/app/product-families/${data.family.id}`)
      // Also busts the list page's client router cache, so it doesn't
      // show stale (pre-duplicate) data the next time it's visited.
      startTransition(() => router.refresh())
    } catch {
      setCopyError(t('duplicateFailedUnreachable'))
    } finally {
      setBusyAction(null)
    }
  }

  const confirmDelete = async () => {
    setBusyAction('delete')
    try {
      const response = await fetch(`/api/product-families/${familyId}`, { method: 'DELETE' })
      if (response.ok) {
        showToast(t('deleteSuccess', { name: familyName }))
        setConfirmingDelete(false)
        if (redirectAfterDeleteHref) {
          router.push(redirectAfterDeleteHref)
        }
        startTransition(() => router.refresh())
      } else {
        showToast(t('deleteFailed'), 'error')
        setConfirmingDelete(false)
      }
    } catch {
      showToast(t('deleteFailed'), 'error')
      setConfirmingDelete(false)
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busyAction !== null}
          onClick={() => void togglePublish()}
        >
          {busyAction === 'publish' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {isPublished ? t('unpublish') : t('publish')}
        </Button>
        <Button
          type="button"
          variant="icon"
          size="icon"
          disabled={busyAction !== null}
          aria-label={t('duplicate')}
          title={t('duplicate')}
          onClick={openCopyDialog}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="icon"
          size="icon"
          disabled={busyAction !== null}
          aria-label={t('delete')}
          title={t('delete')}
          className="hover:border-red-300 hover:bg-red-50 hover:text-red-600"
          onClick={() => setConfirmingDelete(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Dialog.Root
        open={copyDetails !== null}
        onOpenChange={(open) => (!open && busyAction !== 'duplicate' ? setCopyDetails(null) : undefined)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl bg-white p-5 shadow-xl focus:outline-none">
            {copyDetails ? (
              <form onSubmit={(e) => void duplicate(e)} className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-slate-900">{t('copyTitle', { name: familyName })}</Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-slate-500">{t('copyHint')}</Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label={t('cancel')}
                      className="rounded p-1 text-slate-400 hover:text-slate-600"
                      disabled={busyAction === 'duplicate'}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <ProductFamilyDetailsFields
                  idPrefix={`copy-${familyId}`}
                  details={copyDetails}
                  dateError={copyDateError}
                  onChange={(update) => setCopyDetails((current) => (current ? update(current) : current))}
                  nameHint={t('copyNameHint')}
                />

                {copyError ? <p className="text-sm text-red-600">{copyError}</p> : null}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <Dialog.Close asChild>
                    <Button type="button" variant="outline" disabled={busyAction === 'duplicate'}>
                      {t('cancel')}
                    </Button>
                  </Dialog.Close>
                  <Button
                    type="submit"
                    className="gap-2"
                    disabled={busyAction === 'duplicate' || copyDateError !== null || copyDetails.name.trim() === ''}
                  >
                    {busyAction === 'duplicate' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {busyAction === 'duplicate' ? t('copySaving') : t('copySave')}
                  </Button>
                </div>
              </form>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={confirmingDelete}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDescription', { name: familyName })}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        busy={busyAction === 'delete'}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  )
}
