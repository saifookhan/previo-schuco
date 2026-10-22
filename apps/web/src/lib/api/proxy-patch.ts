import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

/**
 * Forwards a JSON PATCH from a client component to the core API with the
 * session credentials attached server-side (the session cookie is
 * httpOnly, so the browser can't call the API directly). Status and body
 * are passed through unchanged so the caller sees the API's own 400/404/409.
 * @param request - The incoming browser request (JSON body)
 * @param apiPath - Core API path, e.g. `/api/product-families/<id>/lines/<id>`
 */
export const proxyPatch = (request: Request, apiPath: string): Promise<NextResponse> => proxyJson(request, apiPath, 'PATCH')

/** `proxyPatch` for any JSON-bodied method (PUT, POST). */
export const proxyJson = async (request: Request, apiPath: string, method: 'PATCH' | 'PUT' | 'POST'): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const response = await fetch(`${authConfig.apiUrl}${apiPath}`, {
    method,
    headers,
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
