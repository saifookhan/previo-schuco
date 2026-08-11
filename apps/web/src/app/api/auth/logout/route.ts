import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'
import { clearSession } from '@/lib/auth/session'

/**
 * Clear session and redirect to login.
 */
export const POST = async (): Promise<NextResponse> => {
  await clearSession()
  return NextResponse.json({ ok: true })
}

export const GET = async (): Promise<NextResponse> => {
  await clearSession()
  return NextResponse.redirect(new URL('/login', authConfig.appUrl))
}
