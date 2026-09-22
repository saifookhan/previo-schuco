'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  ACCESS_MODULES,
  DEFAULT_ACCESS_MATRIX,
  DEMO_ROLES,
  type AccessModule,
  type RoleId,
} from '@/types/settings'

/**
 * Access rights grid — roles × modules toggle matrix.
 */
const AccessRightsPage = () => {
  const t = useTranslations('settingsAccessRights')
  const [matrix, setMatrix] = useState(DEFAULT_ACCESS_MATRIX)

  const toggle = (roleId: RoleId, module: AccessModule) => {
    setMatrix((prev) => ({
      ...prev,
      [roleId]: {
        ...prev[roleId],
        [module]: !prev[roleId]?.[module],
      },
    }))
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{t('permissionMatrix')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-6 py-3 text-left font-medium text-slate-500">{t('moduleHeader')}</th>
                {DEMO_ROLES.map((role) => (
                  <th
                    key={role.id}
                    className="px-4 py-3 text-center font-medium text-slate-700"
                  >
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACCESS_MODULES.map((module) => (
                <tr key={module} className="border-b border-slate-50">
                  <td className="px-6 py-3 font-medium text-slate-900">{module}</td>
                  {DEMO_ROLES.map((role) => {
                    const allowed = matrix[role.id]?.[module] ?? false
                    return (
                      <td key={role.id} className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(role.id, module)}
                          className={cn(
                            'mx-auto flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold transition-colors',
                            allowed
                              ? 'border-green-200 bg-green-100 text-green-700 hover:bg-green-200'
                              : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100',
                          )}
                          aria-label={`${role.name} — ${module}: ${allowed ? t('allowed') : t('denied')}`}
                        >
                          {allowed ? '✓' : '—'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

export default AccessRightsPage
