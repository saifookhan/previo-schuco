'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  Users,
} from 'lucide-react'

import { LanguageSwitcher } from '@/components/language-switcher'
import { hasMinimumRole, useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import type { RoleId } from '@/types/settings'

const mainNav = [
  { href: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard, minRole: 'user' as RoleId },
  { href: '/app/invoice', label: 'Invoice', icon: FileText, minRole: 'user' as RoleId },
]

const settingsNav = [
  { href: '/app/settings/users', label: 'Users', icon: Users, minRole: 'company-admin' as RoleId },
  { href: '/app/settings/roles', label: 'Roles', icon: Shield, minRole: 'super-admin' as RoleId },
  {
    href: '/app/settings/access-rights',
    label: 'Access Rights',
    icon: Shield,
    minRole: 'super-admin' as RoleId,
  },
  { href: '/app/settings/company', label: 'Company', icon: Building2, minRole: 'company-admin' as RoleId },
]

interface AppShellProps {
  children: React.ReactNode
}

/**
 * Sidebar layout for authenticated /app routes with role-based navigation.
 */
export const AppShell = ({ children }: AppShellProps) => {
  const pathname = usePathname()
  const { user, loading, signOut } = useAuth()

  const filterNav = <T extends { minRole: RoleId }>(items: T[]): T[] => {
    if (!user) {
      return []
    }
    return items.filter((item) => hasMinimumRole(user.role.id, item.minRole))
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
          <Building2 className="h-6 w-6 text-brand" />
          <span className="text-lg font-bold text-slate-900">PREVIO</span>
        </div>

        {!loading && user ? (
          <div className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
            <p className="font-medium text-slate-700">{user.name ?? user.email}</p>
            <p>{user.role.name}</p>
          </div>
        ) : null}

        <nav className="flex-1 space-y-6 overflow-y-auto p-4">
          <div>
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Main
            </p>
            <div className="space-y-1">
              {filterNav(mainNav).map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    pathname === href
                      ? 'bg-brand/10 text-brand'
                      : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {filterNav(settingsNav).length > 0 ? (
            <div>
              <p className="mb-2 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Settings className="h-3 w-3" />
                Settings
              </p>
              <div className="space-y-1">
                {filterNav(settingsNav).map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      pathname === href
                        ? 'bg-brand/10 text-brand'
                        : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </nav>

        <div className="border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col pl-64">
        <main className="flex-1">{children}</main>
      </div>

      <LanguageSwitcher />
    </div>
  )
}
