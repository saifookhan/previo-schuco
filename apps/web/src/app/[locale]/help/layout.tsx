import { Building2 } from 'lucide-react'
import Link from 'next/link'
import { getLocale } from 'next-intl/server'

import { LanguageSwitcher } from '@/components/language-switcher'
import { helpChrome, toLocale } from '@/lib/help/nav'

/**
 * Public handbook chrome. Language follows the app cookie, so the URL stays `/help/...`.
 */
const HelpLayout = async ({ children }: { children: React.ReactNode }) => {
  const chrome = helpChrome(toLocale(await getLocale()))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/help" className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-brand" />
            <span className="font-bold text-slate-900">PREVIO</span>
            <span className="hidden text-slate-300 sm:inline">/</span>
            <span className="hidden text-sm font-medium text-slate-600 sm:inline">{chrome.handbook}</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher variant="inline" />
            <Link href="/login" className="text-sm font-medium text-brand hover:text-brand-dark">
              {chrome.signIn}
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}

export default HelpLayout
