'use client'

import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DEMO_ROLES, DEMO_USERS, type Role, type User } from '@/types/settings'

/**
 * Demo users list with role badges.
 */
const UsersPage = () => {
  const t = useTranslations('settingsUsers')
  const [users] = useState<User[]>(DEMO_USERS)
  const roleMap = useMemo(
    () => Object.fromEntries(DEMO_ROLES.map((r) => [r.id, r.name])),
    [],
  )

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          {t('addUser')}
        </Button>
      </div>

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
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-medium text-slate-900">{user.name}</td>
                  <td className="px-6 py-4 text-slate-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <Badge>{roleMap[user.roleId] ?? user.roleId}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={user.status === 'active' ? 'success' : 'muted'}>
                      {user.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

export default UsersPage
