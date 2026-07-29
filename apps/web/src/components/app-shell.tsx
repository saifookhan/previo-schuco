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
import { cn } from '@/lib/utils'

const mainNav = [
  { href: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/invoice', label: 'Invoice', icon: FileText },
]

const settingsNav = [
  { href: '/app/settings/users', label: 'Users', icon: Users },
  { href: '/app/settings/roles', label: 'Roles', icon: Shield },
  { href: '/app/settings/access-rights', label: 'Access Rights', icon: Shield },
  { href: '/app/settings/company', label: 'Company', icon: Building2 },
]

interface AppShellProps {
  children: React.ReactNode
}

/**
 * Sidebar layout for authenticated /app routes.
 */
export const AppShell = ({ children }: AppShellProps) => {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
          <Building2 className="h-6 w-6 text-brand" />
          <span className="text-lg font-bold text-slate-900">Schuco</span>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto p-4">
          <div>
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Main
            </p>
            <div className="space-y-1">
              {mainNav.map(({ href, label, icon: Icon }) => (
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

          <div>
            <p className="mb-2 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Settings className="h-3 w-3" />
              Settings
            </p>
            <div className="space-y-1">
              {settingsNav.map(({ href, label, icon: Icon }) => (
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
        </nav>

        <div className="border-t border-slate-100 p-4">
          <Link
            href="/login"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Link>
        </div>
      </aside>

      <div className="flex flex-1 flex-col pl-64">
        <main className="flex-1">{children}</main>
      </div>

      <LanguageSwitcher />
    </div>
  )
}
