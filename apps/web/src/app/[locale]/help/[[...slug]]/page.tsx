import { headers } from 'next/headers'
import Link from 'next/link'
import { getLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'

import { HelpSidebar } from '@/components/help-sidebar'
import { loadHelpDocument, loadHelpTitles } from '@/lib/help/content'
import { AppLink, HelpAnchor, HelpImage, HelpTable } from '@/lib/help/mdx'
import { flatHelpSlugs, helpChrome, helpHref, isHelpSlug, toLocale } from '@/lib/help/nav'

type HelpPageProps = {
  params: Promise<{ slug?: string[] }>
}

const requestOrigin = async (): Promise<string> => {
  const headerList = await headers()
  const host = (headerList.get('x-forwarded-host') ?? headerList.get('host') ?? 'localhost:3000')
    .split(',')[0]
    .trim()
  const forwarded = headerList.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const proto = forwarded || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** Mailpit stays on its own host. Unset means the local inbox. */
const mailpitOrigin = (): string => {
  const domain = process.env.MAILPIT_DOMAIN?.trim()
  return domain ? `https://${domain}` : 'http://localhost:8025'
}

export const generateMetadata = async ({ params }: HelpPageProps) => {
  const { slug: parts } = await params
  const slug = (parts ?? []).join('/')
  if (!isHelpSlug(slug)) return { title: 'PREVIO' }
  const doc = loadHelpDocument(toLocale(await getLocale()), slug)
  return { title: `${doc.title} — PREVIO` }
}

const HelpPage = async ({ params }: HelpPageProps) => {
  const { slug: parts } = await params
  const slug = (parts ?? []).join('/')
  if (!isHelpSlug(slug)) notFound()

  const locale = toLocale(await getLocale())
  const doc = loadHelpDocument(locale, slug)
  const titles = loadHelpTitles(locale)
  const chrome = helpChrome(locale)
  const appUrl = await requestOrigin()
  const mailpitUrl = mailpitOrigin()
  const flat = flatHelpSlugs()
  const index = flat.indexOf(slug)
  const previous = index > 0 ? flat[index - 1] : undefined
  const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : undefined

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:items-start md:py-8">
      <aside className="hidden w-60 shrink-0 md:block">
        <div className="sticky top-20">
          <HelpSidebar locale={locale} current={slug} titles={titles} />
        </div>
      </aside>

      <details className="rounded-lg border border-slate-200 bg-white md:hidden">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">{chrome.pages}</summary>
        <div className="border-t border-slate-100 px-2 py-3">
          <HelpSidebar locale={locale} current={slug} titles={titles} />
        </div>
      </details>

      <article className="min-w-0 flex-1">
        <div className="help-prose rounded-xl border border-slate-200 bg-white px-5 py-6 shadow-sm md:px-8 md:py-8">
          <MDXRemote
            source={doc.source}
            components={{
              AppLink: (props: { to?: 'app' | 'mailpit'; path?: string }) => (
                <AppLink {...props} appUrl={appUrl} mailpitUrl={mailpitUrl} />
              ),
              a: (props) => <HelpAnchor {...props} slug={slug} />,
              img: HelpImage,
              table: HelpTable,
            }}
            options={{
              // First-party handbook, not remote MDX. Leave expressions alone so JSX props compile.
              blockJS: false,
              mdxOptions: { remarkPlugins: [remarkGfm] },
            }}
          />
        </div>

        <nav className="mt-6 flex items-start justify-between gap-4 text-sm">
          {previous ? (
            <Link href={helpHref(previous)} className="text-brand hover:text-brand-dark">
              ← {chrome.previous}
              <span className="mt-0.5 block text-slate-600">{titles[previous]}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={helpHref(next)} className="text-right text-brand hover:text-brand-dark">
              {chrome.next} →
              <span className="mt-0.5 block text-slate-600">{titles[next]}</span>
            </Link>
          ) : null}
        </nav>
      </article>
    </div>
  )
}

export default HelpPage
