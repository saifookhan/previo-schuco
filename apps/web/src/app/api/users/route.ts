import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

/** Lists users in the caller's own company. */
export const GET = async (): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const response = await fetch(`${authConfig.apiUrl}/api/users`, { headers, cache: 'no-store' })
  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}

/** Requests a new user in the caller's own company (company-admin only) — lands as pending_approval until a super-admin approves it (Stage 3). */
export const POST = async (request: Request): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const response = await fetch(`${authConfig.apiUrl}/api/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
