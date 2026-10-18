import type * as Preset from '@docusaurus/preset-classic'
import type { Config } from '@docusaurus/types'
import { themes as prismThemes } from 'prism-react-renderer'

// URLs shown throughout the docs are resolved at build time from the same
// env vars the selfhost stack uses (docker-compose.yml / Caddyfile), so the
// server build links to the real server and a local build links to localhost.
const httpsOr = (domain: string | undefined, fallback: string) => (domain ? `https://${domain}` : fallback)

// Without a DOMAIN (IP-only box) the app is reached at APP_PUBLIC_URL, e.g. http://<server-ip>:3000.
const appUrl = httpsOr(process.env.DOMAIN, process.env.APP_PUBLIC_URL || 'http://localhost:3000')
const mailpitUrl = httpsOr(process.env.MAILPIT_DOMAIN, 'http://localhost:8025')
const docsUrl = httpsOr(process.env.DOCS_DOMAIN, 'http://localhost:3002')

const config: Config = {
  title: 'PREVIO Docs',
  tagline: 'Features, URLs and demo logins for testing the PREVIO quote platform',
  url: docsUrl,
  baseUrl: '/',
  onBrokenLinks: 'throw',
  markdown: {
    hooks: { onBrokenMarkdownLinks: 'throw' },
  },
  i18n: { defaultLocale: 'en', locales: ['en'] },
  customFields: { appUrl, mailpitUrl },
  presets: [
    [
      'classic',
      {
        docs: { routeBasePath: '/', sidebarPath: './sidebars.ts' },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: 'PREVIO Docs',
      items: [
        { href: appUrl, label: 'Open app', position: 'right' },
        { href: mailpitUrl, label: 'Mailpit', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      copyright: 'PREVIO — internal testing documentation',
    },
    prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula },
  } satisfies Preset.ThemeConfig,
}

export default config
