'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useLoadingTransition } from '@/components/ui/loading-region'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import type { PartnerStatus } from '@schuco/contracts'

export type PartnerAction = 'request' | 'accept' | 'reject' | 'remove'

/** Fired after a connection changes, so the bell and the notifications panel reload. */
export const NOTIFICATIONS_CHANGED_EVENT = 'previo:notifications-changed'

const DONE_MESSAGE: Record<PartnerAction, 'sent' | 'connected' | 'rejected' | 'withdrawn' | 'removed'> = {
  request: 'sent',
  accept: 'connected',
  reject: 'rejected',
  remove: 'removed',
}

/**
 * Runs a connection change (connect, accept, refuse, withdraw/remove) for one
 * company, then shows a toast and reloads the page and the notifications.
 */
export const usePartnerAction = () => {
  const t = useTranslations('partners')
  const router = useRouter()
  const { startTransition } = useLoadingTransition()
  const [busy, setBusy] = useState<PartnerAction | null>(null)

  const run = async (
    company: { id: string; name: string },
    action: PartnerAction,
    /** For `remove`: the status before, so a withdrawn request gets its own message. */
    currentStatus?: PartnerStatus,
  ): Promise<boolean> => {
    setBusy(action)
    try {
      const path = `/api/partners/${encodeURIComponent(company.id)}`
      const response = await fetch(action === 'remove' ? path : `${path}/${action}`, {
        method: action === 'remove' ? 'DELETE' : 'POST',
      })
      const data = (await response.json().catch(() => ({}))) as { status?: PartnerStatus; error?: string }
      if (!response.ok) {
        showToast(data.error ? `${t('actionFailed')}: ${data.error}` : t('actionFailed'), 'error')
        return false
      }
      const done = action === 'remove' && currentStatus === 'sent' ? 'withdrawn' : action === 'request' && data.status === 'connected' ? 'connected' : DONE_MESSAGE[action]
      showToast(t(`done.${done}`, { name: company.name }))
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
      startTransition(() => router.refresh())
      return true
    } catch {
      showToast(t('actionFailed'), 'error')
      return false
    } finally {
      setBusy(null)
    }
  }

  return { run, busy }
}
