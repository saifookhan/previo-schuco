import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { getSession } from '@/lib/auth/session'

/**
 * Proxies an Excel upload to the core API's product-family importer.
 * A route handler (not a server action) because the browser needs to
 * send multipart form data with the file — client components can't read
 * the httpOnly session cookie, so this hop attaches auth server-side.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const headers: Record<string, string> =
    session.accessToken === 'dev-token'
      ? { 'X-Dev-User-Sub': session.sub }
      : { Authorization: `Bearer ${session.accessToken}` }

  const formData = await request.formData()

  const response = await fetch(`${authConfig.apiUrl}/api/product-families/import`, {
    method: 'POST',
    headers,
    body: formData,
  })

  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
