import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import path from 'path'
import { fileURLToPath } from 'url'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const rootDir = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  transpilePackages: ['@schuco/calculation'],
  outputFileTracingRoot: path.join(rootDir, '../..'),
  // The old demo "invoice" editor is gone; quotes are the real thing.
  redirects: async () =>
    ['/app/invoice', '/app/invoices'].map((source) => ({ source, destination: '/app/quotes', permanent: false })),
}

export default withNextIntl(nextConfig)
