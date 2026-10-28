import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingRegion, LoadingRegionProvider } from '@/components/ui/loading-region'
import { fetchFromApiResult } from '@/lib/api/server-client'
import { UserEditButton } from '@/components/user-edit-button'
import { UserInviteButton } from '@/components/user-invite-button'
import type { UsersListResponse } from '@schuco/contracts'

const statusVariant = (status: string): 'success' | 'warning' | 'muted' => {
  if (status === 'active') return 'success'
  if (status === 'pending_approval' || status === 'invited' || status === 'invite_failed') return 'warning'
  return 'muted'
}

/**
 * Real, company-scoped user directory. "Add user" lands the invitee as
 * `pending_approval` — no invite email goes out until a super-admin
 * approves it from the platform admin panel (Stage 3).
 */
const UsersPage = async () => {
  const t = await getTranslations('settingsUsers')
  const result = await fetchFromApiResult<UsersListResponse>('/api/users')
  const users = result.data?.users ?? []
  const loadFailed = result.status === 'error'

  return (
    <div className="p-6 md:p-8">
      <LoadingRegionProvider>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
          </div>
          <UserInviteButton />
        </div>

        {loadFailed ? (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {t('errorLoading')}
          </div>
        ) : null}

        <LoadingRegion>
          <Card>
            <CardHeader>
              <CardTitle>{t('usersCount', { count: users.length })}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-slate-500">
                    <th className="px-6 py-3 font-medium">{t('name')}</th>
                    <th className="px-6 py-3 font-medium">{t('email')}</th>
                    <th className="px-6 py-3 font-medium">{t('role')}</th>
                    <th className="px-6 py-3 font-medium">{t('status')}</th>
                    <th className="px-6 py-3 font-medium">
                      <span className="sr-only">{t('actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-medium text-slate-900">{user.name ?? '—'}</td>
                      <td className="px-6 py-4 text-slate-600">{user.email}</td>
                      <td className="px-6 py-4">
                        {user.roles.map((role) => (
                          <Badge key={role.id} className="mr-1">
                            {role.name}
                          </Badge>
                        ))}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={statusVariant(user.status)}>{t(`statusValue.${user.status}`)}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <UserEditButton user={user} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-slate-400">{t('noUsersFound')}</p>
              ) : null}
            </CardContent>
          </Card>
        </LoadingRegion>
      </LoadingRegionProvider>
    </div>
  )
}

export default UsersPage
