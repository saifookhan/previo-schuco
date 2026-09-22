import { authConfig } from '@/lib/auth/config'
import { getSession } from '@/lib/auth/session'

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

  if (session.accessToken === 'dev-token') {
    headers['X-Dev-User-Sub'] = session.sub
  } else {
    headers.Authorization = `Bearer ${session.accessToken}`
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
