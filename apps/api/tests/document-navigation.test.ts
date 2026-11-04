import { describe, expect, it } from 'vitest'

// apps/web has no test runner; its plain helpers are tested here, like its messages (i18n-messages.test.ts).
import { isDocumentNavigation } from '../../web/src/lib/http/document-navigation'

describe('document vs API navigation', () => {
  const headers = (values: Record<string, string>) => ({
    headers: { get: (name: string) => values[name.toLowerCase()] ?? null },
  })

  it('treats a browser page load as navigation and a JSON client as an API call', () => {
    expect(isDocumentNavigation(headers({ 'sec-fetch-mode': 'navigate', accept: 'text/html' }))).toBe(true)
    expect(isDocumentNavigation(headers({ accept: 'text/html,application/xhtml+xml' }))).toBe(true)
    expect(isDocumentNavigation(headers({ accept: 'application/json' }))).toBe(false)
    expect(isDocumentNavigation(headers({ accept: '*/*' }))).toBe(false)
    // The app router's own fetches (client navigation, prefetch) are not API clients.
    expect(isDocumentNavigation(headers({ rsc: '1', accept: '*/*' }))).toBe(true)
  })
})
