'use client'

import { Copy, Loader2, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { hasMinimumRole, useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'

interface ProductFamilyRowActionsProps {
  familyId: string
  familyName: string
  isPublished: boolean
  /** Where to navigate after a successful delete. Omit to just refresh in place (list page); pass the list route from the detail page, since staying put would 404. */
  redirectAfterDeleteHref?: string
}

/** Publish/unpublish toggle + duplicate + delete, shared by the list and detail pages. */
export const ProductFamilyRowActions = ({
  familyId,
  familyName,
  isPublished,
  redirectAfterDeleteHref,
}: ProductFamilyRowActionsProps) => {
  const t = useTranslations('productFamilyActions')
  const router = useRouter()
  const { user } = useAuth()
  const [busyAction, setBusyAction] = useState<'publish' | 'duplicate' | 'delete' | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (!user || !hasMinimumRole(user.role.id, 'super-user')) {
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
      router.refresh()
    } finally {
      setBusyAction(null)
    }
  }

  const duplicate = async () => {
    setBusyAction('duplicate')
    try {
      const response = await fetch(`/api/product-families/${familyId}/duplicate`, { method: 'POST' })
      const data = (await response.json()) as { family?: { id: string; name: string } }
      if (response.ok && data.family) {
        showToast(t('duplicateSuccess', { name: data.family.name }))
        router.push(`/app/product-families/${data.family.id}`)
        // Also busts the list page's client router cache, so it doesn't
        // show stale (pre-duplicate) data the next time it's visited.
        router.refresh()
      } else {
        showToast(t('duplicateFailed'), 'error')
        router.refresh()
      }
    } catch {
      showToast(t('duplicateFailed'), 'error')
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
        router.refresh()
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
          onClick={() => void duplicate()}
        >
          {busyAction === 'duplicate' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
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
