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

/**
 * Language switcher using next-intl cookie-based locale.
 */
export const LanguageSwitcher = () => {
  const t = useTranslations('language')
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  const switchLocale = (nextLocale: Locale) => {
    router.replace(pathname, { locale: nextLocale })
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <Globe className="h-4 w-4 text-slate-500" aria-hidden="true" />
      <span className="text-xs font-medium text-slate-500">{t('label')}</span>
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
