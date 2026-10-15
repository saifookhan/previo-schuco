'use client'

import { Loader2, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from '@/i18n/navigation'
import type { GrantableRolesResponse, UserDto } from '@schuco/contracts'

/**
 * "Add user" button + modal for a company-admin's own company. Lands as
 * `pending_approval` — no invite email goes out until a super-admin
 * approves it from the platform admin panel (Stage 3).
 */
export const UserInviteButton = () => {
  const t = useTranslations('settingsUsers')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [availableRoles, setAvailableRoles] = useState<GrantableRolesResponse['roles']>([])
  const [rolesState, setRolesState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<{ email: string; name: string; roleIds: string[] }>({ email: '', name: '', roleIds: ['user'] })

  const openDialog = () => {
    setForm({ email: '', name: '', roleIds: ['user'] })
    setError(null)
    setOpen(true)
    // The role list comes from the server so custom roles a super-admin adds show up here.
    setRolesState('loading')
    void fetch('/api/roles', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<GrantableRolesResponse>) : null))
      .then((data) => {
        setAvailableRoles(data?.roles ?? [])
        setRolesState(data ? 'ready' : 'failed')
        // Keep only default selections that exist for this caller.
        if (data) {
          const ids = new Set(data.roles.map((r) => r.id))
          setForm((f) => ({ ...f, roleIds: f.roleIds.filter((id) => ids.has(id)) }))
        }
      })
      .catch(() => setRolesState('failed'))
  }

  const create = async () => {
    if (!form.email.trim()) {
      setError(t('emailRequired'))
      return
    }
    if (form.roleIds.length === 0) {
      setError(t('rolesRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, name: form.name || undefined, roleIds: form.roleIds }),
      })
      const data = (await response.json().catch(() => ({}))) as { user?: UserDto; error?: string }
      if (!response.ok || !data.user) {
        setError(data.error ? `${t('addUserFailed')}: ${data.error}` : t('addUserFailed'))
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError(t('addUserFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="button" className="gap-2" onClick={openDialog}>
        <Plus className="h-4 w-4" />
        {t('addUser')}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-6"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-md overflow-auto rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{t('addUserTitle')}</p>
                <p className="text-xs text-slate-500">{t('addUserHint')}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="invite-email">
                  {t('email')}
                  <span className="text-red-500"> *</span>
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="invite-name">{t('name')}</Label>
                <Input
                  id="invite-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-700">{t('role')}</legend>
                {rolesState === 'loading' ? <p className="text-xs text-slate-400">{t('rolesLoading')}</p> : null}
                {rolesState === 'failed' ? <p className="text-xs text-red-600">{t('rolesLoadFailed')}</p> : null}
                {availableRoles.map((role) => (
                  <label key={role.id} htmlFor={`invite-role-${role.id}`} className="flex cursor-pointer items-center gap-2.5">
                    <input
                      id={`invite-role-${role.id}`}
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 accent-brand"
                      checked={form.roleIds.includes(role.id)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          roleIds: e.target.checked ? [...f.roleIds, role.id] : f.roleIds.filter((id) => id !== role.id),
                        }))
                      }
                    />
                    <span className="text-sm text-slate-900">{role.name}</span>
                  </label>
                ))}
              </fieldset>
            </div>

            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="button" disabled={saving || rolesState !== 'ready'} className="gap-2" onClick={() => void create()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? t('adding') : t('addUser')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
