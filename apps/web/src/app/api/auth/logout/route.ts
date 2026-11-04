import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { attachClearedSession } from '@/lib/auth/session'

/**
 * Clear the session cookie on this response. The browser applies
 * Set-Cookie before the fetch promise resolves, so the client can confirm
 * the cookie is gone (GET /api/auth/session) before it navigates.
 */
export const POST = async (): Promise<NextResponse> => {
  return attachClearedSession(NextResponse.json({ ok: true }))
}

export const GET = async (): Promise<NextResponse> => {
  return attachClearedSession(NextResponse.redirect(new URL('/login', authConfig.appUrl)))
}
