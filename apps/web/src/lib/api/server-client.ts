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
  const headers = await buildAuthHeaders()
  if (!headers) {
    return null
  }

  try {
    const response = await fetch(`${authConfig.apiUrl}${path}`, {
      headers,
      cache: 'no-store',
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  }
}
