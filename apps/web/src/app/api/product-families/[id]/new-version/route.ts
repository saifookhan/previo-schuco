import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { getSession, getSessionToken } from '@/lib/auth/session'

/**
 * Proxies an updated Excel upload to the core API's new-version endpoint.
 * Same multipart-forwarding shape as /api/product-families/import — see
 * that route for why this can't just use buildAuthHeaders() (it sets
 * Content-Type: application/json, which would break the multipart body).
 */
export const POST = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> => {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const headers: Record<string, string> = session.isDevLogin
    ? { 'X-Dev-User-Sub': session.sub }
    : { Authorization: `Bearer ${await getSessionToken()}` }

  const { id } = await params
  const formData = await request.formData()

  const response = await fetch(`${authConfig.apiUrl}/api/product-families/${id}/new-version`, {
    method: 'POST',
    headers,
    body: formData,
  })

  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
