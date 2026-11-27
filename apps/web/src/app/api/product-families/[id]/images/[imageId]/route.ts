import { NextResponse } from 'next/server'

import { proxyEmpty, proxyJson } from '@/lib/api/proxy-patch'
import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

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

/** Proxies an image title edit. */
export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
): Promise<NextResponse> => {
  const { id, imageId } = await params
  return proxyJson(request, `/api/product-families/${id}/images/${imageId}`, 'PATCH')
}

/** Proxies deleting an image. */
export const DELETE = async (
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
): Promise<NextResponse> => {
  const { id, imageId } = await params
  return proxyEmpty(`/api/product-families/${id}/images/${imageId}`, 'DELETE')
}
