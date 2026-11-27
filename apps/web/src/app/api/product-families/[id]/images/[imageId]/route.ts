import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

/** Removes a picture: a managed slot stays empty, an extra slot is deleted. */
export const DELETE = async (
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id, imageId } = await params
  const response = await fetch(`${authConfig.apiUrl}/api/product-families/${id}/images/${imageId}`, {
    method: 'DELETE',
    headers,
  })
  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}

/** Proxies an embedded product-family image so an <img> tag can load it without exposing the session token. */
export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id, imageId } = await params
  const response = await fetch(`${authConfig.apiUrl}/api/product-families/${id}/images/${imageId}`, {
    headers,
    cache: 'no-store',
  })

  if (!response.ok) {
    return NextResponse.json({ error: 'Not found' }, { status: response.status })
  }

  const buffer = await response.arrayBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
