import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

/** Streams the quote PDF — only the server side can attach the session credentials the core API needs. */
export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const response = await fetch(`${authConfig.apiUrl}/api/sales-quotes/${id}/pdf`, { headers, cache: 'no-store' })

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
    return NextResponse.json(data, { status: response.status })
  }

  const buffer = await response.arrayBuffer()
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': response.headers.get('content-disposition') ?? 'inline',
      'Cache-Control': 'private, no-store',
    },
  })
}
