'use client'

import { Copy, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { hasMinimumRole, useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'

interface ProductFamilyRowActionsProps {
  familyId: string
  isPublished: boolean
}

/** Publish/unpublish toggle + duplicate button, shared by the list and detail pages. */
export const ProductFamilyRowActions = ({ familyId, isPublished }: ProductFamilyRowActionsProps) => {
  const router = useRouter()
  const { user } = useAuth()
  const [busyAction, setBusyAction] = useState<'publish' | 'duplicate' | null>(null)

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
      const data = (await response.json()) as { family?: { id: string } }
      if (response.ok && data.family) {
        router.push(`/app/product-families/${data.family.id}`)
      } else {
        router.refresh()
      }
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busyAction !== null}
        onClick={() => void togglePublish()}
      >
        {busyAction === 'publish' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {isPublished ? 'Unpublish' : 'Publish'}
      </Button>
      <Button
        type="button"
        variant="icon"
        size="icon"
        disabled={busyAction !== null}
        aria-label="Duplicate"
        title="Duplicate"
        onClick={() => void duplicate()}
      >
        {busyAction === 'duplicate' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  )
}
