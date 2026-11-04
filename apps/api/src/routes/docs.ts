import { swaggerUI } from '@hono/swagger-ui'
import { buildOpenApiDocument } from '@schuco/contracts'
import { Hono } from 'hono'

/**
 * A loopback API_PUBLIC_URL (the Compose default) would make Swagger's
 * Try it out call the agent's own machine. A relative URL calls the host
 * that served this document.
 */
export const openApiServerUrl = (configured: string | undefined): string => {
  if (!configured) return '/'
  try {
    const host = new URL(configured).hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return '/'
  } catch {
    return configured.startsWith('/') ? configured : '/'
  }
  return configured
}

/**
 * Swagger UI and OpenAPI JSON routes.
 * @param apiUrl - Public base URL for the core API; loopback values become a relative server URL
 */
export const createDocsRoutes = (apiUrl: string): Hono => {
  const docs = new Hono()
  const openApiDocument = buildOpenApiDocument({
    apiUrl: openApiServerUrl(apiUrl),
  })

  docs.get('/openapi.json', (c) => c.json(openApiDocument))
  docs.get('/docs', swaggerUI({ url: '/openapi.json' }))

  return docs
}
