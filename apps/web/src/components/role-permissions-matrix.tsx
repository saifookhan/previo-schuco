'use client'

import * as Popover from '@radix-ui/react-popover'
import { Info, Loader2, Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { IMPLIED_PERMISSIONS, permissionLock, type Permission, type RolePermissionsResponse } from '@schuco/contracts'

type Matrix = Record<string, Permission[]>

/** next-intl keys can't contain dots, so `catalog.view` is stored as `catalog_view`. */
const permissionKey = (permission: Permission) => permission.replace('.', '_')

const cloneMatrix = (matrix: Record<string, readonly Permission[]>): Matrix =>
  Object.fromEntries(Object.entries(matrix).map(([role, perms]) => [role, [...perms]]))

const sameMatrix = (a: Matrix, b: Matrix) => {
  const roles = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...roles].every((role) => [...(a[role] ?? [])].sort().join() === [...(b[role] ?? [])].sort().join())
}

/**
 * Info icon next to a role's name; clicking it shows the role's description. The popover is
 * portalled out of the scrolling table, so it never clips or widens it, and flips at screen edges.
 */
const RoleDescriptionHint = ({ roleName, description, label }: { roleName: string; description: string; label: string }) => (
  <Popover.Root>
    <Popover.Trigger
      aria-label={label}
      className="rounded-full text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 data-[state=open]:text-slate-700"
    >
      <Info className="h-3.5 w-3.5" />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        side="bottom"
        align="center"
        sideOffset={8}
        collisionPadding={16}
        className="z-50 w-64 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs leading-snug text-slate-600 shadow-lg focus:outline-none"
      >
        <p className="mb-0.5 font-medium text-slate-900">{roleName}</p>
        {description}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
)

/** Global role × permission editor (super-admin). Cells that the API would reject are locked here too. */
export const RolePermissionsMatrix = ({ initial }: { initial: RolePermissionsResponse }) => {
  const t = useTranslations('settingsAccessRights')
  const [saved, setSaved] = useState<Matrix>(() => cloneMatrix(initial.matrix))
  const [draft, setDraft] = useState<Matrix>(() => cloneMatrix(initial.matrix))
  const [isDefault, setIsDefault] = useState(initial.isDefault)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const dirty = !sameMatrix(draft, saved)

  /** Built-in roles have translated descriptions; custom ones show what was typed, if anything. */
  const roleDescription = (role: { id: string; description: string }) =>
    t.has(`roleDescriptions.${role.id}`) ? t(`roleDescriptions.${role.id}`) : role.description || t('customRole')

  const lockReason = (roleId: string, permission: Permission): string | null => {
    const lock = permissionLock(roleId, permission)
    if (lock === 'super-admin') {
      return t('lockSuperAdmin')
    }
    if (lock === 'company-admin-users') {
      return t('lockCompanyAdminUsers')
    }
    return null
  }

  const isAllowed = (roleId: string, permission: Permission) =>
    roleId === 'super-admin' ? true : draft[roleId]?.includes(permission) ?? false

  const toggle = (roleId: string, permission: Permission) => {
    setMessage(null)
    setDraft((prev) => {
      const current = prev[roleId] ?? []
      let next = current.includes(permission) ? current.filter((p) => p !== permission) : [...current, permission]
      // edit needs view: granting edit grants view too, revoking view revokes edit too
      for (const [edit, view] of IMPLIED_PERMISSIONS) {
        if (next.includes(edit) && !next.includes(view)) {
          next = permission === edit ? [...next, view] : next.filter((p) => p !== edit)
        }
      }
      return { ...prev, [roleId]: next }
    })
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/role-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix: draft }),
      })
      const data = (await response.json().catch(() => ({}))) as Partial<RolePermissionsResponse> & { error?: string }
      if (!response.ok || !data.matrix) {
        setMessage({ kind: 'error', text: data.error ? `${t('saveFailed')}: ${data.error}` : t('saveFailed') })
        return
      }
      setSaved(cloneMatrix(data.matrix))
      setDraft(cloneMatrix(data.matrix))
      setIsDefault(data.isDefault ?? false)
      setMessage({ kind: 'ok', text: t('saved') })
    } catch {
      setMessage({ kind: 'error', text: t('saveFailedUnreachable') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{t('permissionMatrix')}</CardTitle>
        {isDefault ? <p className="mt-1 text-xs text-slate-500">{t('usingDefaults')}</p> : null}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-6 py-3 text-left font-medium text-slate-500">{t('permissionHeader')}</th>
                {initial.roles.map((role) => (
                  <th key={role.id} className="px-4 py-3 text-center font-medium text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      {role.name}
                      <RoleDescriptionHint
                        roleName={role.name}
                        description={roleDescription(role)}
                        label={t('roleInfo', { role: role.name })}
                      />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initial.permissions.map((permission) => (
                <tr key={permission} className="border-b border-slate-50">
                  <td className="px-6 py-3">
                    <p className="font-medium text-slate-900">{t(`permissionLabels.${permissionKey(permission)}`)}</p>
                    <p className="text-xs text-slate-500">{t(`permissionHints.${permissionKey(permission)}`)}</p>
                  </td>
                  {initial.roles.map((role) => {
                    const allowed = isAllowed(role.id, permission)
                    const lock = lockReason(role.id, permission)
                    return (
                      <td key={role.id} className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={lock !== null}
                          title={lock ?? undefined}
                          onClick={() => toggle(role.id, permission)}
                          className={cn(
                            'mx-auto flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold transition-colors',
                            allowed
                              ? 'border-green-200 bg-green-100 text-green-700'
                              : 'border-slate-200 bg-slate-50 text-slate-400',
                            lock === null
                              ? allowed
                                ? 'hover:bg-green-200'
                                : 'hover:bg-slate-100'
                              : 'cursor-not-allowed opacity-70',
                          )}
                          aria-label={`${role.name} — ${t(`permissionLabels.${permissionKey(permission)}`)}: ${allowed ? t('allowed') : t('denied')}`}
                        >
                          {lock !== null && allowed ? <Lock className="h-3.5 w-3.5" /> : allowed ? '✓' : '—'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <p className="text-xs text-slate-500">{t('capabilityNote')}</p>
          <div className="flex items-center gap-3">
            {message ? (
              <span className={cn('text-xs', message.kind === 'ok' ? 'text-green-700' : 'text-red-600')}>
                {message.text}
              </span>
            ) : null}
            <Button type="button" variant="outline" disabled={!dirty || saving} onClick={() => setDraft(cloneMatrix(saved))}>
              {t('discard')}
            </Button>
            <Button type="button" disabled={!dirty || saving} className="gap-2" onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? t('saving') : t('saveChanges')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
