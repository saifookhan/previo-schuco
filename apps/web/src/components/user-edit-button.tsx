'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Pencil, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import type { GrantableRolesResponse, UserDto } from '@schuco/contracts'

type Form = { name: string; roleIds: string[]; active: boolean }

/**
 * Pencil button + dialog to edit a user of the caller's company: name, roles, active/inactive.
 * Email is the sign-in identity, so it's shown but not editable. The API enforces the same
 * rules the dialog shows (no self-deactivation, keep your own admin role); roles the caller can't
 * grant stay as they are and are shown locked.
 */
export const UserEditButton = ({ user: target }: { user: UserDto }) => {
  const t = useTranslations('settingsUsers')
  const router = useRouter()
  const { user, hasRole } = useAuth()
  const [form, setForm] = useState<Form | null>(null)
  const [availableRoles, setAvailableRoles] = useState<GrantableRolesResponse['roles']>([])
  const [rolesState, setRolesState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Ignores a slow role-list response from an earlier opening of the dialog. */
  const rolesRequest = useRef(0)

  // Only a super-admin may change a super-admin; the API refuses it for everyone else anyway.
  if (!user || (target.roles.some((role) => role.id === 'super-admin') && !hasRole('super-admin'))) {
    return null
  }

  const isSelf = target.id === user.id
  const canToggleStatus = target.status === 'active' || target.status === 'inactive'

  const openDialog = () => {
    setForm({ name: target.name ?? '', roleIds: target.roles.map((role) => role.id), active: target.status !== 'inactive' })
    setError(null)
    setRolesState('loading')
    const request = ++rolesRequest.current
    void fetch('/api/roles', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<GrantableRolesResponse>) : null))
      .then((data) => {
        if (request !== rolesRequest.current) return
        setAvailableRoles(data?.roles ?? [])
        setRolesState(data ? 'ready' : 'failed')
      })
      .catch(() => {
        if (request === rolesRequest.current) setRolesState('failed')
      })
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    if (form.roleIds.length === 0) {
      setError(t('rolesRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          roleIds: form.roleIds,
          ...(canToggleStatus ? { status: form.active ? 'active' : 'inactive' } : {}),
        }),
      })
      const data = (await response.json().catch(() => ({}))) as { user?: UserDto; error?: string }
      if (!response.ok || !data.user) {
        setError(data.error ? `${t('editFailed')}: ${data.error}` : t('editFailed'))
        return
      }
      setForm(null)
      showToast(t('editSaved', { email: target.email }))
      router.refresh()
    } catch {
      setError(t('editFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  /** Roles the caller can grant, plus any the user already holds (kept, shown read-only if not grantable). */
  const roleOptions = [
    ...availableRoles,
    ...target.roles.filter((role) => !availableRoles.some((r) => r.id === role.id)).map((role) => ({ ...role, description: '' })),
  ]
  const grantable = new Set(availableRoles.map((role) => role.id))

  return (
    <>
      <Button
        type="button"
        variant="icon"
        size="icon"
        aria-label={t('editUser', { email: target.email })}
        title={t('edit')}
        onClick={openDialog}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      <Dialog.Root open={form !== null} onOpenChange={(open) => (!open && !saving ? setForm(null) : undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl bg-white p-5 shadow-xl focus:outline-none">
            {form ? (
              <form onSubmit={(e) => void save(e)} className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Dialog.Title className="text-lg font-semibold text-slate-900">{t('editTitle')}</Dialog.Title>
                    <Dialog.Description className="mt-1 truncate text-sm text-slate-500">{target.email}</Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button type="button" aria-label={t('close')} className="rounded p-1 text-slate-400 hover:text-slate-600" disabled={saving}>
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`edit-user-name-${target.id}`}>{t('name')}</Label>
                  <Input
                    id={`edit-user-name-${target.id}`}
                    value={form.name}
                    maxLength={200}
                    onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                  />
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-slate-700">{t('role')}</legend>
                  {rolesState === 'loading' ? <p className="text-xs text-slate-400">{t('rolesLoading')}</p> : null}
                  {rolesState === 'failed' ? <p className="text-xs text-red-600">{t('rolesLoadFailed')}</p> : null}
                  {rolesState === 'ready'
                    ? roleOptions.map((role) => {
                        // Your own admin role stays, so you can't lock yourself out.
                        const ownAdminRole =
                          isSelf && (role.id === 'company-admin' || role.id === 'super-admin') && target.roles.some((r) => r.id === role.id)
                        const locked = !grantable.has(role.id) || ownAdminRole
                        return (
                          <label
                            key={role.id}
                            htmlFor={`edit-user-${target.id}-role-${role.id}`}
                            className="flex cursor-pointer items-center gap-2.5"
                          >
                            <input
                              id={`edit-user-${target.id}-role-${role.id}`}
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 accent-brand"
                              disabled={locked}
                              checked={form.roleIds.includes(role.id)}
                              onChange={(e) =>
                                setForm((f) =>
                                  f
                                    ? {
                                        ...f,
                                        roleIds: e.target.checked ? [...f.roleIds, role.id] : f.roleIds.filter((id) => id !== role.id),
                                      }
                                    : f,
                                )
                              }
                            />
                            <span className="text-sm text-slate-900">{role.name}</span>
                          </label>
                        )
                      })
                    : null}
                  {isSelf && target.roles.some((r) => r.id === 'company-admin' || r.id === 'super-admin') ? (
                    <p className="text-xs text-slate-500">{t('ownAdminRoleHint')}</p>
                  ) : null}
                </fieldset>

                {canToggleStatus ? (
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand"
                      disabled={isSelf}
                      checked={form.active}
                      onChange={(e) => setForm((f) => (f ? { ...f, active: e.target.checked } : f))}
                    />
                    <span>
                      {t('activeLabel')}
                      <span className="block text-xs text-slate-500">{isSelf ? t('activeSelfHint') : t('activeHint')}</span>
                    </span>
                  </label>
                ) : (
                  <p className="text-xs text-slate-500">{t('statusPendingHint')}</p>
                )}

                {error ? <p className="text-sm text-red-600">{error}</p> : null}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <Dialog.Close asChild>
                    <Button type="button" variant="outline" disabled={saving}>
                      {t('cancel')}
                    </Button>
                  </Dialog.Close>
                  <Button type="submit" className="gap-2" disabled={saving || rolesState !== 'ready' || form.roleIds.length === 0}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {saving ? t('saving') : t('save')}
                  </Button>
                </div>
              </form>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
