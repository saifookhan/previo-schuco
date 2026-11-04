import { NextResponse } from 'next/server'

import { DEMO_USER_SEEDS } from '@schuco/db/demo-users'

import { isDevLoginAllowed } from '@/lib/auth/config'
import { setSession } from '@/lib/auth/session'

/**
 * Password-less login for the seeded demo users. Unavailable unless
 * `ALLOW_DEV_LOGIN=true` (see `isDevLoginAllowed`) — hiding the form is
 * not enough, this handler is the gate.
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
