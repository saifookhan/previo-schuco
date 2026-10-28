import { describe, expect, it } from 'vitest'

import { createDocsRoutes, openApiServerUrl } from '../src/routes/docs'
import { isDocumentNavigation } from '../../web/src/lib/http/document-navigation'

describe('OpenAPI server URL', () => {
  it('does not point Try it out at loopback', () => {
    expect(openApiServerUrl('http://localhost:3001')).toBe('/')
    expect(openApiServerUrl('http://127.0.0.1:3001')).toBe('/')
    expect(openApiServerUrl(undefined)).toBe('/')
    expect(openApiServerUrl('https://demo.example.com')).toBe('https://demo.example.com')
  })

  it('lists routes the deployment can actually serve and no planned localhost services', async () => {
    const response = await createDocsRoutes('http://localhost:3001').request('/openapi.json')
    expect(response.status).toBe(200)
    const spec = (await response.json()) as { servers: Array<{ url: string }>; paths: Record<string, unknown> }
    expect(spec.servers.map((server) => server.url)).toEqual(['/'])
    const paths = spec.paths
    expect(paths['/api/quotes']).toBeUndefined()
    expect(paths['/api/products']).toBeUndefined()
    expect(paths['/calculate']).toBeUndefined()
    expect(paths['/upload']).toBeUndefined()
    expect(paths['/api/me']).toBeDefined()
    expect(paths['/health']).toBeDefined()
    expect(paths['/api/product-families']).toBeDefined()
    expect(paths['/api/product-families/{id}']).toBeDefined()
    expect(paths['/api/product-families/{id}/shares']).toBeDefined()
    expect(paths['/api/sales-quotes']).toBeDefined()
    expect(paths['/api/admin/users']).toBeDefined()
    expect(JSON.stringify(spec)).not.toContain('localhost:3002')
    expect(JSON.stringify(spec)).not.toContain('localhost:3003')
  })
})

describe('document vs API navigation', () => {
  const headers = (values: Record<string, string>) => ({
    headers: { get: (name: string) => values[name.toLowerCase()] ?? null },
  })

  it('treats a browser page load as navigation and a JSON client as an API call', () => {
    expect(isDocumentNavigation(headers({ 'sec-fetch-mode': 'navigate', accept: 'text/html' }))).toBe(true)
    expect(isDocumentNavigation(headers({ accept: 'text/html,application/xhtml+xml' }))).toBe(true)
    expect(isDocumentNavigation(headers({ accept: 'application/json' }))).toBe(false)
    expect(isDocumentNavigation(headers({ accept: '*/*' }))).toBe(false)
  })
})
