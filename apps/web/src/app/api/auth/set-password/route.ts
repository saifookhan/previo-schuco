import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { setSession } from '@/lib/auth/session'

/**
 * Consumes an invite-accept or password-reset token and sets the new
 * password (proxies to apps/api — see its /api/auth/set-password). On
 * success, also logs the user in: they just proved control of the
 * email address via the token, so there's no reason to make them log
 * in again right after.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  const body = await request.json().catch(() => null)

  let response: Response
  try {
    response = await fetch(`${authConfig.apiUrl}/api/auth/set-password`, {
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
    return NextResponse.json({ error: data.error ?? 'Could not set password' }, { status: response.status || 400 })
  }

  await setSession({
    sub: data.user.id,
    email: data.user.email,
    name: data.user.name ?? undefined,
    isDevLogin: false,
  })

  return NextResponse.json({ ok: true })
}
