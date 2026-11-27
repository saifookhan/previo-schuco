'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Building2, LayoutDashboard, LogOut, Menu, ScrollText, Users, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { LanguageSwitcher } from '@/components/language-switcher'
import { Toaster } from '@/components/toaster'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

const adminNav = [
  { href: '/admin/dashboard', labelKey: 'adminDashboard', icon: LayoutDashboard },
  { href: '/admin/users', labelKey: 'adminUsers', icon: Users },
  { href: '/admin/companies', labelKey: 'adminCompanies', icon: Building2 },
  { href: '/admin/audit-log', labelKey: 'auditLog', icon: ScrollText },
] as const

interface AdminShellProps {
  children: React.ReactNode
}

/**
 * Sidebar layout for super-admin /admin routes.
 */
export const AdminShell = ({ children }: AdminShellProps) => {
  const pathname = usePathname()
  const { user, loading, signOut } = useAuth()
  const t = useTranslations('nav')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800"
          aria-label={t('openMenu')}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Building2 className="h-5 w-5 text-amber-400" />
        <span className="font-bold text-white">PREVIO</span>
      </div>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col border-r border-slate-800 bg-slate-900 transition-transform duration-200 md:translate-x-0',
          mobileOpen && 'translate-x-0',
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-800 px-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-amber-400" />
            <div>
              <span className="text-lg font-bold text-white">PREVIO</span>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
                {t('admin')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 md:hidden"
            aria-label={t('closeMenu')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!loading && user ? (
          <div className="border-b border-slate-800 px-5 py-3 text-xs text-slate-400">
            <p className="font-medium text-slate-200">{user.name ?? user.email}</p>
            <p>{user.roles.map((role) => role.name).join(', ')}</p>
          </div>
        ) : null}

        <nav className="flex-1 space-y-1 p-4">
          {adminNav.map(({ href, labelKey, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-amber-400/10 text-amber-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
              )}
            >
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </Link>
          ))}
        </nav>

        <div className="space-y-1 border-t border-slate-800 p-4">
          <Link
            href="/app/dashboard"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <LayoutDashboard className="h-4 w-4" />
            {t('backToApp')}
          </Link>
          <Link
            href="/help"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <BookOpen className="h-4 w-4" />
            {t('handbook')}
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <LogOut className="h-4 w-4" />
            {t('signOut')}
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col md:pl-64">
        {/* pb-16 reserves room for the floating LanguageSwitcher (fixed bottom-6),
            so it never overlaps a page's last section. */}
        <main className="flex-1 pb-16 text-slate-100">{children}</main>
      </div>

      <LanguageSwitcher />
      <Toaster />
    </div>
  )
}
