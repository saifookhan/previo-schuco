import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

/** Proxies the family detail fetch for client components (e.g. the quote builder loading a family's lines/characteristics/matrices on selection). */
export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const response = await fetch(`${authConfig.apiUrl}/api/product-families/${id}`, { headers, cache: 'no-store' })

  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}

/** Proxies "Delete" so a client component can trigger it without seeing the session token. */
export const DELETE = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const response = await fetch(`${authConfig.apiUrl}/api/product-families/${id}`, {
    method: 'DELETE',
    headers,
  })

  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
