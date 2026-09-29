import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

/** Approves a pending invite request — sends the actual invite email. */
export const POST = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id } = await params
  const response = await fetch(`${authConfig.apiUrl}/api/admin/users/${id}/approve`, { method: 'POST', headers })
  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
