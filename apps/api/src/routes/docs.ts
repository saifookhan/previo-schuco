import { swaggerUI } from '@hono/swagger-ui'
import { buildOpenApiDocument } from '@schuco/contracts'
import { Hono } from 'hono'

/**
 * Swagger UI and OpenAPI JSON routes.
 * @param apiUrl - Public base URL for the core API
 */
export const createDocsRoutes = (apiUrl: string): Hono => {
  const docs = new Hono()
  const openApiDocument = buildOpenApiDocument({
    apiUrl,
    calculationUrl: process.env.CALCULATION_SERVICE_URL ?? 'http://localhost:3002',
    filesUrl: process.env.FILES_SERVICE_URL ?? 'http://localhost:3003',
  })

  docs.get('/openapi.json', (c) => c.json(openApiDocument))
  docs.get('/docs', swaggerUI({ url: '/openapi.json' }))

  return docs
}
