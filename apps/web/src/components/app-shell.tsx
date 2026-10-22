'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { LanguageSwitcher } from '@/components/language-switcher'
import { Toaster } from '@/components/toaster'
import { hasMinimumRole, useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import type { RoleId } from '@/types/settings'
import type { Permission } from '@schuco/contracts'

const mainNav = [
  { href: '/app/dashboard', labelKey: 'dashboard', icon: LayoutDashboard, minRole: 'user' as RoleId },
  {
    href: '/app/product-families',
    labelKey: 'productFamilies',
    icon: Package,
    minRole: 'user' as RoleId,
    permission: 'catalog.view' as Permission,
  },
  {
    href: '/app/quotes',
    labelKey: 'quotes',
    icon: FileSpreadsheet,
    minRole: 'user' as RoleId,
    permission: 'quote.view' as Permission,
  },
]

const settingsNav = [
  { href: '/app/settings/users', labelKey: 'users', icon: Users, minRole: 'company-admin' as RoleId },
  {
    href: '/app/settings/access-rights',
    labelKey: 'accessRights',
    icon: Shield,
    minRole: 'super-admin' as RoleId,
  },
  { href: '/app/settings/company', labelKey: 'company', icon: Building2, minRole: 'company-admin' as RoleId },
  { href: '/app/settings/audit-log', labelKey: 'auditLog', icon: ScrollText, minRole: 'company-admin' as RoleId },
]

const adminNav = [
  { href: '/admin/dashboard', labelKey: 'adminPortal', icon: ShieldCheck, minRole: 'super-admin' as RoleId },
]

interface AppShellProps {
  children: React.ReactNode
}

/**
 * Sidebar layout for authenticated /app routes with role-based navigation.
 */
export const AppShell = ({ children }: AppShellProps) => {
  const pathname = usePathname()
  const { user, loading, signOut, can } = useAuth()
  const t = useTranslations('nav')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const filterNav = <T extends { minRole: RoleId; permission?: Permission }>(items: T[]): T[] => {
    if (!user) {
      return []
    }
    return items.filter((item) => (item.permission ? can(item.permission) : hasMinimumRole(user.role.id, item.minRole)))
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          aria-label={t('openMenu')}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Building2 className="h-5 w-5 text-brand" />
        <span className="font-bold text-slate-900">PREVIO</span>
      </div>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:translate-x-0',
          mobileOpen && 'translate-x-0',
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-100 px-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-brand" />
            <span className="text-lg font-bold text-slate-900">PREVIO</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden"
            aria-label={t('closeMenu')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!loading && user ? (
          <div className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
            <p className="font-medium text-slate-700">{user.name ?? user.email}</p>
            <p>{user.roles.map((role) => role.name).join(', ')}</p>
          </div>
        ) : null}

        <nav className="flex-1 space-y-6 overflow-y-auto p-4">
          <div>
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('main')}
            </p>
            <div className="space-y-1">
              {filterNav(mainNav).map(({ href, labelKey, icon: Icon }) => (
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
                  {t(labelKey)}
                </Link>
              ))}
            </div>
          </div>

          {filterNav(settingsNav).length > 0 ? (
            <div>
              <p className="mb-2 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Settings className="h-3 w-3" />
                {t('settings')}
              </p>
              <div className="space-y-1">
                {filterNav(settingsNav).map(({ href, labelKey, icon: Icon }) => (
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
                    {t(labelKey)}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {filterNav(adminNav).length > 0 ? (
            <div>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {t('platform')}
              </p>
              <div className="space-y-1">
                {filterNav(adminNav).map(({ href, labelKey, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      pathname.startsWith('/admin')
                        ? 'bg-brand/10 text-brand'
                        : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t(labelKey)}
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
            {t('signOut')}
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col md:pl-64">
        {/* pb-16 reserves room for the floating LanguageSwitcher (fixed bottom-6),
            so it never overlaps a page's last section. */}
        <main className="flex-1 pb-16">{children}</main>
      </div>

      <LanguageSwitcher />
      <Toaster />
    </div>
  )
}
