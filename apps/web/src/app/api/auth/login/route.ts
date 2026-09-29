import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { setSession } from '@/lib/auth/session'

/**
 * Email+password login. Proxies to apps/api's /api/auth/login (which
 * does the actual password check), then mints and sets the session
 * cookie here — only this server side has `next/headers`' cookie store.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  const body = await request.json().catch(() => null)

  let response: Response
  try {
    response = await fetch(`${authConfig.apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return NextResponse.json({ error: 'API unreachable' }, { status: 503 })
  }

  const data = (await response.json().catch(() => ({}))) as {
    user?: { id: string; email: string; name: string | null }
    error?: string
  }

  if (!response.ok || !data.user) {
    return NextResponse.json({ error: data.error ?? 'Login failed' }, { status: response.status || 401 })
  }

  await setSession({
    sub: data.user.id,
    email: data.user.email,
    name: data.user.name ?? undefined,
    isDevLogin: false,
  })

  return NextResponse.json({ ok: true })
}
