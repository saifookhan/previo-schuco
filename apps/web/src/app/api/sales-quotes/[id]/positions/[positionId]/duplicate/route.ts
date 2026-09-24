import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

/** Duplicates a position as a new one appended to the end of the quote. */
export const POST = async (
  _request: Request,
  { params }: { params: Promise<{ id: string; positionId: string }> },
): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { id, positionId } = await params
  const response = await fetch(`${authConfig.apiUrl}/api/sales-quotes/${id}/positions/${positionId}/duplicate`, {
    method: 'POST',
    headers,
  })

  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
