import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'

import { buildAuthorizeUrl, createPkcePair } from '@/lib/auth/cognito-oauth'
import { isCognitoConfigured } from '@/lib/auth/config'
import { setPkceVerifier } from '@/lib/auth/session'

/**
 * Redirect user to Cognito hosted UI (or dev login when Cognito is not configured).
 */
export const GET = async (): Promise<NextResponse> => {
  if (!isCognitoConfigured()) {
    return NextResponse.redirect(new URL('/login?dev=1', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'))
  }

  const state = randomBytes(16).toString('hex')
  const { verifier, challenge } = createPkcePair()
  await setPkceVerifier(verifier)

  const url = buildAuthorizeUrl(state, challenge)
  const response = NextResponse.redirect(url)
  response.cookies.set('previo_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })

  return response
}
