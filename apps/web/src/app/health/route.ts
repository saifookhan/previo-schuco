import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'

/** Public health check. The API serves this at /health; the BFF proxies it so the same path works on the deployment. */
export const GET = async (): Promise<NextResponse> => {
  try {
    const response = await fetch(`${authConfig.apiUrl}/health`, { cache: 'no-store' })
    const data = await response.json().catch(() => ({ error: 'Invalid response from API' }))
    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json({ error: 'API unreachable' }, { status: 503 })
  }
}
