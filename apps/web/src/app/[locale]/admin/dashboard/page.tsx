import { AlertTriangle, Building2, Shield, Users, UserX } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchFromApiResult } from '@/lib/api/server-client'
import type { AdminUsersListResponse } from '@schuco/contracts'

/**
 * Super-admin dashboard with platform-wide user stats.
 */
const AdminDashboardPage = async () => {
  const t = await getTranslations('adminDashboard')
  const tStatus = await getTranslations('settingsUsers.statusValue')
  const result = await fetchFromApiResult<AdminUsersListResponse>('/api/admin/users')
  const users = result.data?.users ?? []
  const loadFailed = result.status === 'error'

  const activeCount = users.filter((user) => user.status === 'active').length
  const inactiveCount = users.length - activeCount
  const companyCount = new Set(users.map((user) => user.company.id)).size
  const superAdminCount = users.filter((user) => user.role.id === 'super-admin').length

  const stats = [
    { label: t('totalUsers'), value: String(users.length), icon: Users, detail: t('acrossAllCompanies') },
    {
      label: t('activeUsers'),
      value: String(activeCount),
      icon: Shield,
      detail: t('inactiveCount', { count: inactiveCount }),
    },
    { label: t('companies'), value: String(companyCount), icon: Building2, detail: t('atLeastOneUser') },
    { label: t('superAdmins'), value: String(superAdminCount), icon: UserX, detail: t('platformOperators') },
  ]

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('subtitle')}</p>
      </div>

      {loadFailed ? (
        <div className="mb-8 flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {t('errorLoading')}
        </div>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, detail }) => (
          <Card key={label} className="border-slate-800 bg-slate-900">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-400">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-white">{value}</p>
                  <p className="mt-1 text-xs text-slate-500">{detail}</p>
                </div>
                <div className="rounded-lg bg-amber-400/10 p-2">
                  <Icon className="h-5 w-5 text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-white">{t('recentUsers')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {users.slice(0, 5).map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between rounded-lg border border-slate-800 px-4 py-3"
            >
              <div>
                <p className="font-medium text-white">{user.name ?? user.email}</p>
                <p className="text-sm text-slate-400">
                  {user.company.name} · {user.role.name}
                </p>
              </div>
              <span
                className={
                  user.status === 'active' ? 'text-xs text-emerald-400' : 'text-xs text-slate-500'
                }
              >
                {tStatus(user.status)}
              </span>
            </div>
          ))}
          {users.length === 0 ? (
            <p className="text-sm text-slate-500">{t('noUsersFound')}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export default AdminDashboardPage
