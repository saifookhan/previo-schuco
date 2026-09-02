'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, LayoutDashboard, LogOut, Users } from 'lucide-react'

import { LanguageSwitcher } from '@/components/language-switcher'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

const adminNav = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
]

interface AdminShellProps {
  children: React.ReactNode
}

/**
 * Sidebar layout for super-admin /admin routes.
 */
export const AdminShell = ({ children }: AdminShellProps) => {
  const pathname = usePathname()
  const { user, loading, signOut } = useAuth()

  return (
    <div className="flex min-h-screen bg-slate-950">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800 bg-slate-900">
        <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5">
          <Building2 className="h-6 w-6 text-amber-400" />
          <div>
            <span className="text-lg font-bold text-white">PREVIO</span>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
              Admin
            </p>
          </div>
        </div>

        {!loading && user ? (
          <div className="border-b border-slate-800 px-5 py-3 text-xs text-slate-400">
            <p className="font-medium text-slate-200">{user.name ?? user.email}</p>
            <p>{user.role.name}</p>
          </div>
        ) : null}

        <nav className="flex-1 space-y-1 p-4">
          {adminNav.map(({ href, label, icon: Icon }) => (
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
              {label}
            </Link>
          ))}
        </nav>

        <div className="space-y-1 border-t border-slate-800 p-4">
          <Link
            href="/app/dashboard"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <LayoutDashboard className="h-4 w-4" />
            Back to app
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col pl-64">
        <main className="flex-1 text-slate-100">{children}</main>
      </div>

      <LanguageSwitcher />
    </div>
  )
}
