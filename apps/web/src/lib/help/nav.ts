import { defaultLocale, locales, type Locale } from '@/i18n/config'

export const helpPageSlugs = [
  '',
  'urls',
  'demo-logins',
  'email-mailpit',
  'demo-data',
  'features/product-families',
  'features/partners',
  'features/sharing',
  'features/quotes',
  'features/users-and-onboarding',
  'features/roles-and-permissions',
  'features/admin-panel',
  'excel-format',
  'pricing',
  'api',
  'testing-checklist',
  'known-gaps',
  'reporting-bugs',
  'release-notes',
] as const

export type HelpSlug = (typeof helpPageSlugs)[number]

export const isHelpSlug = (slug: string): slug is HelpSlug =>
  (helpPageSlugs as readonly string[]).includes(slug)

type GroupId = 'features' | 'reference'

export type HelpNavEntry =
  | { kind: 'page'; slug: HelpSlug }
  | { kind: 'group'; id: GroupId; slugs: HelpSlug[] }

/** Same order as the old Docusaurus sidebar. */
export const helpNav: HelpNavEntry[] = [
  { kind: 'page', slug: '' },
  { kind: 'page', slug: 'urls' },
  { kind: 'page', slug: 'demo-logins' },
  { kind: 'page', slug: 'email-mailpit' },
  { kind: 'page', slug: 'demo-data' },
  {
    kind: 'group',
    id: 'features',
    slugs: [
      'features/product-families',
      'features/partners',
      'features/sharing',
      'features/quotes',
      'features/users-and-onboarding',
      'features/roles-and-permissions',
      'features/admin-panel',
    ],
  },
  {
    kind: 'group',
    id: 'reference',
    slugs: ['excel-format', 'pricing', 'api'],
  },
  { kind: 'page', slug: 'testing-checklist' },
  { kind: 'page', slug: 'known-gaps' },
  { kind: 'page', slug: 'reporting-bugs' },
  { kind: 'page', slug: 'release-notes' },
]

const groupLabels: Record<GroupId, Record<Locale, string>> = {
  features: { en: 'Features', it: 'Funzionalità', de: 'Funktionen' },
  reference: { en: 'Reference', it: 'Riferimenti', de: 'Referenz' },
}

const chrome: Record<
  Locale,
  { handbook: string; signIn: string; pages: string; previous: string; next: string }
> = {
  en: { handbook: 'Handbook', signIn: 'Sign in', pages: 'Pages', previous: 'Previous', next: 'Next' },
  it: { handbook: 'Manuale', signIn: 'Accedi', pages: 'Pagine', previous: 'Precedente', next: 'Avanti' },
  de: { handbook: 'Handbuch', signIn: 'Anmelden', pages: 'Seiten', previous: 'Zurück', next: 'Weiter' },
}

const admonitionLabels: Record<string, Record<Locale, string>> = {
  warning: { en: 'Warning', it: 'Attenzione', de: 'Warnung' },
  tip: { en: 'Tip', it: 'Suggerimento', de: 'Tipp' },
  caution: { en: 'Caution', it: 'Vorsicht', de: 'Vorsicht' },
  note: { en: 'Note', it: 'Nota', de: 'Hinweis' },
  info: { en: 'Info', it: 'Info', de: 'Info' },
  danger: { en: 'Danger', it: 'Pericolo', de: 'Gefahr' },
}

export const toLocale = (value: string): Locale =>
  (locales as readonly string[]).includes(value) ? (value as Locale) : defaultLocale

export const helpChrome = (locale: Locale) => chrome[locale]

export const helpGroupLabel = (id: GroupId, locale: Locale): string => groupLabels[id][locale]

export const admonitionLabel = (kind: string, locale: Locale): string =>
  admonitionLabels[kind]?.[locale] ?? kind

export const helpHref = (slug: string): string => (slug ? `/help/${slug}` : '/help')

export const flatHelpSlugs = (): HelpSlug[] =>
  helpNav.flatMap((entry) => (entry.kind === 'page' ? [entry.slug] : entry.slugs))
