import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { decodeJwtPayload, exchangeCodeForTokens } from '@/lib/auth/cognito-oauth'
import { authConfig, getRedirectUri, isCognitoConfigured } from '@/lib/auth/config'
import { getPkceVerifier, setSession } from '@/lib/auth/session'

/**
 * OAuth callback — exchange code for session cookie.
 */
export const GET = async (request: Request): Promise<NextResponse> => {
  if (!isCognitoConfigured()) {
    return NextResponse.redirect(new URL('/login?error=cognito_not_configured', authConfig.appUrl))
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieStore = await cookies()
  const savedState = cookieStore.get('previo_oauth_state')?.value

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL('/login?error=invalid_state', authConfig.appUrl))
  }

  const verifier = await getPkceVerifier()
  if (!verifier) {
    return NextResponse.redirect(new URL('/login?error=missing_verifier', authConfig.appUrl))
  }

  try {
    const tokens = await exchangeCodeForTokens(code, verifier)
    const payload = decodeJwtPayload(tokens.id_token)
    const sub = String(payload.sub ?? '')
    const email = String(payload.email ?? '')
    const name = typeof payload.name === 'string' ? payload.name : undefined
    const exp = Math.floor(Date.now() / 1000) + tokens.expires_in

    await setSession({
      sub,
      email,
      name,
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      exp,
    })

    cookieStore.delete('previo_oauth_state')
    cookieStore.delete('previo_pkce_verifier')

    return NextResponse.redirect(new URL('/app/dashboard', authConfig.appUrl))
  } catch {
    return NextResponse.redirect(new URL('/login?error=token_exchange', authConfig.appUrl))
  }
}

/** Export redirect URI for Cognito console setup docs. */
export const dynamic = 'force-dynamic'
void getRedirectUri
