import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

/** Full quote detail: header + positions + each position's selected characteristics. */
export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const response = await fetch(`${authConfig.apiUrl}/api/sales-quotes/${id}`, { headers, cache: 'no-store' })
  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
