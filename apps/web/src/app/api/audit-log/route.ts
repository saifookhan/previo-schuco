import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

/** One page of the audit log (company admin: own company; super-admin: all). Filters pass through as the query string. */
export const GET = async (request: Request): Promise<NextResponse> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { search } = new URL(request.url)
  const response = await fetch(`${authConfig.apiUrl}/api/audit-log${search}`, { headers, cache: 'no-store' })
  const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
  return NextResponse.json(data, { status: response.status })
}
