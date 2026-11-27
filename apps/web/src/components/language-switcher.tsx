'use client'

import { Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { locales, type Locale } from '@/i18n/config'
import { usePathname, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

const localeLabels: Record<Locale, string> = {
  it: 'IT',
  en: 'EN',
  de: 'DE',
}

type LanguageSwitcherProps = {
  /** `fixed` floats over the page. `inline` sits in a header so it does not cover content. */
  variant?: 'fixed' | 'inline'
}

/**
 * Language switcher using next-intl cookie-based locale.
 */
export const LanguageSwitcher = ({ variant = 'fixed' }: LanguageSwitcherProps) => {
  const t = useTranslations('language')
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  const switchLocale = (nextLocale: Locale) => {
    // localePrefix is 'never' — the URL doesn't change on a locale switch,
    // so Next's router treats replace() as a no-op and never re-fetches
    // the server-rendered (translated) content. refresh() forces that
    // re-fetch now that the locale cookie has been updated.
    router.replace(pathname, { locale: nextLocale })
    router.refresh()
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border border-slate-200 bg-white',
        variant === 'fixed' ? 'fixed bottom-6 right-6 z-50 px-3 py-2 shadow-lg' : 'px-2 py-1',
      )}
    >
      <Globe className="h-4 w-4 text-slate-500" aria-hidden="true" />
      <span className={cn('text-xs font-medium text-slate-500', variant === 'inline' && 'sr-only')}>
        {t('label')}
      </span>
      <div className="flex gap-1">
        {locales.map((loc) => (
          <button
            key={loc}
            onClick={() => switchLocale(loc)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-semibold transition-colors',
              locale === loc
                ? 'bg-brand text-white'
                : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {localeLabels[loc]}
          </button>
        ))}
      </div>
    </div>
  )
}
