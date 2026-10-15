'use client'

import { Loader2, Plus, Shield, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Link, useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import type { RoleDto } from '@schuco/contracts'

/** Roles list (super-admin): create a custom role, delete an unused one. Permissions are edited in the access-rights matrix. */
export const RolesManager = ({ roles }: { roles: RoleDto[] }) => {
  const t = useTranslations('settingsRoles')
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<RoleDto | null>(null)
  const [deleting, setDeleting] = useState(false)

  const create = async () => {
    if (!name.trim()) {
      setError(t('nameRequired'))
      return
    }
    setCreating(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description.trim() || undefined }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(data.error ? `${t('createFailed')}: ${data.error}` : t('createFailed'))
        return
      }
      showToast(t('created', { name: name.trim() }))
      setName('')
      setDescription('')
      router.refresh()
    } catch {
      setError(t('createFailedUnreachable'))
    } finally {
      setCreating(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) {
      return
    }
    setDeleting(true)
    try {
      const response = await fetch(`/api/admin/roles/${encodeURIComponent(pendingDelete.id)}`, { method: 'DELETE' })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (response.ok) {
        showToast(t('deleted', { name: pendingDelete.name }))
        router.refresh()
      } else {
        showToast(data.error ?? t('deleteFailed'), 'error')
      }
    } catch {
      showToast(t('deleteFailed'), 'error')
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{role.name}</CardTitle>
                  {role.builtIn ? <Badge variant="muted">{t('builtIn')}</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-slate-500">{role.description || t('customRole')}</p>
              </div>
              {!role.builtIn ? (
                <button
                  type="button"
                  onClick={() => setPendingDelete(role)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={t('removeLabel', { name: role.name })}
                  title={role.userCount > 0 ? t('inUse', { count: role.userCount }) : t('removeLabel', { name: role.name })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="font-mono text-xs text-slate-400">{role.id}</p>
              <p className="text-xs text-slate-500">{t('users', { count: role.userCount })}</p>
            </CardContent>
          </Card>
        ))}

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>{t('addRole')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="role-name">{t('roleNameLabel')}</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('roleNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-desc">{t('descriptionLabel')}</Label>
              <Input
                id="role-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')}
              />
            </div>
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <Button type="button" disabled={creating} onClick={() => void create()} className="w-full gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creating ? t('creating') : t('addRole')}
            </Button>
            <p className="text-xs text-slate-500">{t('newRoleHint')}</p>
            <Link href="/app/settings/access-rights" className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline">
              <Shield className="h-3.5 w-3.5" />
              {t('editPermissions')}
            </Link>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('deleteTitle', { name: pendingDelete?.name ?? '' })}
        description={
          pendingDelete && pendingDelete.userCount > 0 ? t('inUse', { count: pendingDelete.userCount }) : t('deleteMessage')
        }
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  )
}
