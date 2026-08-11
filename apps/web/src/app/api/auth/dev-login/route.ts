import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { setSession } from '@/lib/auth/session'

/**
 * Dev-only login for local testing without Cognito.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const body = (await request.json()) as { email?: string }
  const email = body.email?.toLowerCase() ?? ''

  const devUsers: Record<string, { sub: string; name: string }> = {
    'admin@schuco-demo.it': { sub: 'seed-super-admin', name: 'Anna Bianchi' },
    'admin@technometal-demo.it': { sub: 'seed-company-admin', name: 'Luca Verdi' },
    'manager@technometal-demo.it': { sub: 'seed-super-user', name: 'Giulia Neri' },
    'sales@technometal-demo.it': { sub: 'seed-user', name: 'Marco Rossi' },
  }

  const match = devUsers[email]
  if (!match) {
    return NextResponse.json({ error: 'Unknown dev user email' }, { status: 400 })
  }

  const exp = Math.floor(Date.now() / 1000) + 86400
  await setSession({
    sub: match.sub,
    email,
    name: match.name,
    accessToken: 'dev-token',
    idToken: 'dev-token',
    exp,
  })

  return NextResponse.json({ ok: true })
}
