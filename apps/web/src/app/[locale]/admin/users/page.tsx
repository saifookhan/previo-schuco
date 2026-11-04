import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingRegion, LoadingRegionProvider } from '@/components/ui/loading-region'
import { fetchFromApiResult } from '@/lib/api/server-client'
import { PendingApprovalsCard } from '@/components/pending-approvals-card'
import { activeCapabilityKeys } from '@/lib/company-capabilities'
import type { AdminUsersListResponse } from '@schuco/contracts'

/**
 * Super-admin users table listing all platform users across companies,
 * plus a pending-approvals section (Stage 3) for company-admin-requested
 * users still awaiting a decision.
 */
const AdminUsersPage = async () => {
  const t = await getTranslations('adminUsers')
  const tCompanies = await getTranslations('adminCompanies')
  const tStatus = await getTranslations('settingsUsers.statusValue')
  const [result, pendingResult] = await Promise.all([
    fetchFromApiResult<AdminUsersListResponse>('/api/admin/users'),
    fetchFromApiResult<AdminUsersListResponse>('/api/admin/users/pending'),
  ])
  const users = result.data?.users ?? []
  const pending = pendingResult.data?.users ?? []
  const loadFailed = result.status === 'error'

  return (
    <div className="p-6 md:p-8">
      <LoadingRegionProvider>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('subtitle')}</p>
        </div>

        <PendingApprovalsCard pending={pending} />

        {loadFailed ? (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {t('errorLoading')}
          </div>
        ) : null}

        <LoadingRegion tone="dark">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-white">{t('usersCount', { count: users.length })}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-slate-400">
                    <th className="px-6 py-3 font-medium">{t('name')}</th>
                    <th className="px-6 py-3 font-medium">{t('email')}</th>
                    <th className="px-6 py-3 font-medium">{t('company')}</th>
                    <th className="px-6 py-3 font-medium">{t('role')}</th>
                    <th className="px-6 py-3 font-medium">{t('status')}</th>
                    <th className="px-6 py-3 font-medium">{t('cognitoSub')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-6 py-4 font-medium text-white">{user.name ?? '—'}</td>
                      <td className="px-6 py-4 text-slate-300">{user.email}</td>
                      <td className="px-6 py-4 text-slate-300">
                        <div>{user.company.name}</div>
                        <div className="text-xs text-slate-500">
                          {activeCapabilityKeys(user.company.capabilities)
                            .map((key) => tCompanies(`typeValue.${key}`))
                            .join(', ')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {user.roles.map((role) => (
                          <Badge key={role.id} className="mr-1">
                            {role.name}
                          </Badge>
                        ))}
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant={
                            user.status === 'active'
                              ? 'success'
                              : user.status === 'pending_approval'
                                ? 'warning'
                                : 'muted'
                          }
                        >
                          {tStatus(user.status)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">{user.cognitoSub}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 ? (
                <p className="px-6 py-8 text-sm text-slate-500">{t('noUsersFound')}</p>
              ) : null}
            </CardContent>
          </Card>
        </LoadingRegion>
      </LoadingRegionProvider>
    </div>
  )
}

export default AdminUsersPage
