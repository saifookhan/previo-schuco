import Link from 'next/link'

import type { Locale } from '@/i18n/config'
import { helpChrome, helpGroupLabel, helpHref, helpNav, type HelpSlug } from '@/lib/help/nav'
import { cn } from '@/lib/utils'

type HelpSidebarProps = {
  locale: Locale
  current: HelpSlug
  titles: Record<HelpSlug, string>
}

const NavLink = ({
  slug,
  title,
  current,
  nested,
}: {
  slug: HelpSlug
  title: string
  current: HelpSlug
  nested?: boolean
}) => {
  const active = slug === current
  return (
    <Link
      href={helpHref(slug)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'block rounded-md px-3 py-1.5 text-sm transition-colors',
        nested && 'pl-3',
        active ? 'bg-brand/10 font-medium text-brand' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      {title}
    </Link>
  )
}

/** Sidebar for the public testing handbook. Titles come from each page's frontmatter. */
export const HelpSidebar = ({ locale, current, titles }: HelpSidebarProps) => (
  <nav aria-label={helpChrome(locale).pages} className="space-y-0.5">
    {helpNav.map((entry) => {
      if (entry.kind === 'page') {
        return <NavLink key={entry.slug || 'home'} slug={entry.slug} title={titles[entry.slug]} current={current} />
      }
      return (
        <div key={entry.id} className="pt-3">
          <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {helpGroupLabel(entry.id, locale)}
          </p>
          <div className="space-y-0.5">
            {entry.slugs.map((slug) => (
              <NavLink key={slug} slug={slug} title={titles[slug]} current={current} nested />
            ))}
          </div>
        </div>
      )
    })}
  </nav>
)
