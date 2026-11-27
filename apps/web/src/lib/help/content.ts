import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cache } from 'react'

import type { Locale } from '@/i18n/config'

import { admonitionLabel, helpHref, helpPageSlugs, type HelpSlug } from './nav'

const helpRoot = (): string => {
  const root = join(process.cwd(), 'content', 'help')
  if (!existsSync(root)) {
    throw new Error(`Help content not found at ${root}`)
  }
  return root
}

const stemFor = (slug: string): string => (slug === '' ? 'intro' : slug)

const readLocaleFile = (locale: Locale, slug: string): string | null => {
  const stem = stemFor(slug)
  for (const ext of ['.mdx', '.md']) {
    const path = join(helpRoot(), locale, `${stem}${ext}`)
    if (existsSync(path)) return readFileSync(path, 'utf8')
  }
  return null
}

export type HelpDocument = {
  slug: HelpSlug
  title: string
  source: string
  href: string
}

const splitFrontmatter = (raw: string): { title: string; body: string } => {
  if (!raw.startsWith('---\n')) return { title: '', body: raw }
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) return { title: '', body: raw }
  const yaml = raw.slice(4, end)
  const titleLine = yaml.split('\n').find((line) => line.startsWith('title:'))
  const title = titleLine ? titleLine.slice('title:'.length).trim().replace(/^['"]|['"]$/g, '') : ''
  return { title, body: raw.slice(end + 5) }
}

/** Docusaurus `:::kind title` blocks become blockquotes the MDX compiler can render. */
const expandAdmonitions = (markdown: string, locale: Locale): string =>
  markdown.replace(
    /^:::(\w+)[ \t]*([^\n]*)\n([\s\S]*?)\n:::[ \t]*$/gm,
    (_match, kind: string, title: string, body: string) => {
      const label = title.trim() || admonitionLabel(kind, locale)
      const quoted = body
        .replace(/\s+$/, '')
        .split('\n')
        .map((line) => (line.length === 0 ? '>' : `> ${line}`))
        .join('\n')
      return `> **${label}**\n>\n${quoted}\n`
    },
  )

const prepareSource = (raw: string, locale: Locale): { title: string; source: string } => {
  const { title, body } = splitFrontmatter(raw)
  const withoutImport = body.replace(/^import\s+AppLink\s+from\s+['"][^'"]+['"]\s*\n?/gm, '')
  return { title, source: expandAdmonitions(withoutImport, locale) }
}

export const loadHelpDocument = cache((locale: Locale, slug: HelpSlug): HelpDocument => {
  const raw = readLocaleFile(locale, slug) ?? readLocaleFile('en', slug)
  if (!raw) throw new Error(`Missing help page "${slug}"`)
  const { title, source } = prepareSource(raw, locale)
  return { slug, title: title || slug || 'Handbook', source, href: helpHref(slug) }
})

export const loadHelpTitles = (locale: Locale): Record<HelpSlug, string> => {
  const titles = {} as Record<HelpSlug, string>
  for (const slug of helpPageSlugs) {
    titles[slug] = loadHelpDocument(locale, slug).title
  }
  return titles
}
