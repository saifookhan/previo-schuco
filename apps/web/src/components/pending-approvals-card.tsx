'use client'

import { Check, Loader2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLoadingTransition } from '@/components/ui/loading-region'
import { useRouter } from '@/i18n/navigation'
import type { AdminUserDto } from '@schuco/contracts'

interface PendingApprovalsCardProps {
  pending: AdminUserDto[]
}

/** Stage 3: company-admin-requested users awaiting a super-admin's approve/reject decision — nothing is emailed to them until then. */
export const PendingApprovalsCard = ({ pending }: PendingApprovalsCardProps) => {
  const t = useTranslations('adminUsers')
  const router = useRouter()
  // Refreshes run in the table's loading region, so the list shows it is reloading (ADR 0014).
  const { startTransition } = useLoadingTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (pending.length === 0) {
    return null
  }

  const decide = async (userId: string, action: 'approve' | 'reject') => {
    setBusyId(userId)
    setError(null)
    try {
      const response = await fetch(`/api/admin/users/${userId}/${action}`, { method: 'POST' })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ? `${t('decisionFailed')}: ${data.error}` : t('decisionFailed'))
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError(t('decisionFailedUnreachable'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className="mb-6 border-amber-900/50 bg-amber-950/20">
      <CardHeader>
        <CardTitle className="text-white">{t('pendingApprovalsCount', { count: pending.length })}</CardTitle>
        <p className="text-sm text-slate-400">{t('pendingApprovalsSubtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.map((user) => (
          <div
            key={user.id}
            className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-medium text-white">{user.name ?? user.email}</p>
              <p className="text-sm text-slate-400">{user.email}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="muted">{user.company.name}</Badge>
                {user.roles.map((role) => (
                  <Badge key={role.id} className="mr-1">
                    {role.name}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={busyId === user.id}
                onClick={() => void decide(user.id, 'approve')}
                className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {busyId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t('approve')}
              </button>
              <button
                type="button"
                disabled={busyId === user.id}
                onClick={() => void decide(user.id, 'reject')}
                className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-red-950/50 hover:text-red-300 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                {t('reject')}
              </button>
            </div>
          </div>
        ))}
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </CardContent>
    </Card>
  )
}
