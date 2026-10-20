import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { getSession, getSessionToken } from '@/lib/auth/session'

/**
 * Build authenticated headers for server-side API requests.
 */
export const buildAuthHeaders = async (): Promise<Record<string, string> | null> => {
  const session = await getSession()
  if (!session) {
    return null
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (session.isDevLogin) {
    headers['X-Dev-User-Sub'] = session.sub
  } else {
    const token = await getSessionToken()
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

/**
 * Fetch JSON from the core API with the current session credentials.
 * @param path - API path including leading slash
 */
export const fetchFromApi = async <T>(path: string): Promise<T | null> => {
  const result = await fetchFromApiResult<T>(path)
  return result.data
}

export type ApiFetchResult<T> =
  | { data: T; status: 'ok' }
  | { data: null; status: 'unauthenticated' | 'not_found' | 'error' }

/**
 * Same as {@link fetchFromApi}, but distinguishes "not authenticated",
 * "API returned an error/not-found status", and "request itself failed"
 * (network down, API unreachable) instead of collapsing all three into
 * `null` — callers that need to tell a real error apart from a
 * legitimately empty result should use this.
 * @param path - API path including leading slash
 */
export const fetchFromApiResult = async <T>(path: string): Promise<ApiFetchResult<T>> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return { data: null, status: 'unauthenticated' }
  }

  try {
    const response = await fetch(`${authConfig.apiUrl}${path}`, {
      headers,
      cache: 'no-store',
    })

    if (!response.ok) {
      return { data: null, status: response.status === 404 ? 'not_found' : 'error' }
    }

    return { data: (await response.json()) as T, status: 'ok' }
  } catch {
    return { data: null, status: 'error' }
  }
}

/**
 * Route-handler body for a plain authenticated GET passthrough to the core API:
 * forwards the incoming query string, returns the API's JSON and status as-is.
 * @param request - The incoming route-handler request (for its query string)
 * @param path - API path including leading slash, without query
 */
export const proxyGetToApi = async (request: Request, path: string): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { search } = new URL(request.url)
  const response = await fetch(`${authConfig.apiUrl}${path}${search}`, { headers, cache: 'no-store' })
  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
