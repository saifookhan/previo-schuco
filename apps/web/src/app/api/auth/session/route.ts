import { NextResponse } from 'next/server'

import { authConfig, isDevLoginAllowed } from '@/lib/auth/config'
import { attachClearedSession, getSession, getSessionToken } from '@/lib/auth/session'

/**
 * Return current session user profile from API /api/me.
 */
export const GET = async (): Promise<NextResponse> => {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  // Drop a dev-login cookie once the shortcut is off, so an old session
  // cannot keep calling the API as that seeded user.
  if (session.isDevLogin && !isDevLoginAllowed()) {
    return attachClearedSession(NextResponse.json({ user: null }, { status: 401 }))
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await getSessionToken()}`,
  }

  try {
    const response = await fetch(`${authConfig.apiUrl}/api/me`, { headers, cache: 'no-store' })

    if (!response.ok) {
      return NextResponse.json({ user: null, session: { email: session.email } }, { status: 401 })
    }

    const data = (await response.json()) as { user: unknown }
    return NextResponse.json({
      user: data.user,
      session: { email: session.email, sub: session.sub },
    })
  } catch {
    return NextResponse.json(
      { error: 'API unreachable', apiUrl: authConfig.apiUrl },
      { status: 503 },
    )
  }
}
