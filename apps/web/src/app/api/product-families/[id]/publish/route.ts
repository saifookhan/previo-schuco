import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

/** Proxies the publish/unpublish toggle so a client component can trigger it without seeing the session token. */
export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)

  const response = await fetch(`${authConfig.apiUrl}/api/product-families/${id}/publish`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
