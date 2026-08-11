import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { getSession } from '@/lib/auth/session'

/**
 * Return current session user profile from API /api/me.
 */
export const GET = async (): Promise<NextResponse> => {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (session.accessToken === 'dev-token') {
    headers['X-Dev-User-Sub'] = session.sub
  } else {
    headers.Authorization = `Bearer ${session.accessToken}`
  }

  const response = await fetch(`${authConfig.apiUrl}/api/me`, { headers, cache: 'no-store' })

  if (!response.ok) {
    return NextResponse.json({ user: null, session: { email: session.email } }, { status: 401 })
  }

  const data = (await response.json()) as { user: unknown }
  return NextResponse.json({ user: data.user, session: { email: session.email, sub: session.sub } })
}
