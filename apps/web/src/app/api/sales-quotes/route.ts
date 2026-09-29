import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

/** Lists the caller's own quotes. */
export const GET = async (): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const response = await fetch(`${authConfig.apiUrl}/api/sales-quotes`, { headers, cache: 'no-store' })
  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}

/** Creates a new draft quote. */
export const POST = async (request: Request): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const response = await fetch(`${authConfig.apiUrl}/api/sales-quotes`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
