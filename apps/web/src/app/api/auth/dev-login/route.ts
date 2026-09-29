import { NextResponse } from 'next/server'

import { DEMO_USER_SEEDS } from '@schuco/db/demo-users'

import { isDevLoginAllowed } from '@/lib/auth/config'
import { setSession } from '@/lib/auth/session'

/**
 * Dev-only login for the seeded demo users — bypasses password auth
 * entirely, gated by `isDevLoginAllowed()` (never in production unless
 * explicitly opted into, e.g. the self-host Compose profile).
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  if (!isDevLoginAllowed()) {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const body = (await request.json()) as { email?: string }
  const email = body.email?.toLowerCase() ?? ''

  const match = DEMO_USER_SEEDS.find(
    (user) => user.email === email && user.status === 'active',
  )

  if (!match) {
    return NextResponse.json({ error: 'Unknown dev user email' }, { status: 400 })
  }

  await setSession({
    sub: match.cognitoSub,
    email: match.email,
    name: match.name,
    isDevLogin: true,
  })

  return NextResponse.json({ ok: true })
}
