import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

/** Stops sharing a manufacturer's catalog with a partner (super-admin only). */
export const DELETE = async (
  _request: Request,
  { params }: { params: Promise<{ manufacturerId: string; partnerId: string }> },
): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { manufacturerId, partnerId } = await params
  const response = await fetch(
    `${authConfig.apiUrl}/api/admin/links/${encodeURIComponent(manufacturerId)}/${encodeURIComponent(partnerId)}`,
    { method: 'DELETE', headers },
  )
  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
