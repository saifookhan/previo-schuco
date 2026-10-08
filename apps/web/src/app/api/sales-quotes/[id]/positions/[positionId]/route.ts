import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

/** Re-prices an existing position in place. */
export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string; positionId: string }> },
): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id, positionId } = await params
  const body = await request.json().catch(() => null)
  const response = await fetch(`${authConfig.apiUrl}/api/sales-quotes/${id}/positions/${positionId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}

/** Removes a position from a quote. */
export const DELETE = async (
  _request: Request,
  { params }: { params: Promise<{ id: string; positionId: string }> },
): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id, positionId } = await params
  const response = await fetch(`${authConfig.apiUrl}/api/sales-quotes/${id}/positions/${positionId}`, {
    method: 'DELETE',
    headers,
  })

  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
