import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

import { authConfig } from './config'

const SESSION_COOKIE = 'previo_session'
const VERIFIER_COOKIE = 'previo_pkce_verifier'

export interface SessionPayload {
  sub: string
  email: string
  name?: string
  accessToken: string
  idToken: string
  exp: number
}

const getSecretKey = (): Uint8Array =>
  new TextEncoder().encode(authConfig.authSecret)

/**
 * Whether the session/PKCE cookies get the `Secure` flag. Defaults to
 * `NODE_ENV === 'production'`, but that default is wrong for a
 * production-mode deployment served over plain HTTP (e.g. a self-hosted
 * single server reached by IP, no reverse-proxy TLS yet) — a `Secure`
 * cookie is silently dropped by the browser over HTTP, so login would
 * appear to succeed but every subsequent request would look
 * unauthenticated. Set `COOKIE_SECURE=false` explicitly in that case.
 */
const cookieSecure = (): boolean =>
  process.env.COOKIE_SECURE === 'false' ? false : process.env.NODE_ENV === 'production'

/**
 * Persist encrypted session in an HTTP-only cookie.
 * @param payload - Session claims and tokens
 */
export const setSession = async (payload: SessionPayload): Promise<void> => {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(payload.exp)
    .sign(getSecretKey())

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
    expires: new Date(payload.exp * 1000),
  })
}

/**
 * Read and verify session from cookie.
 */
export const getSession = async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) {
    return null
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

/**
 * Clear session and PKCE verifier cookies.
 */
export const clearSession = async (): Promise<void> => {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  cookieStore.delete(VERIFIER_COOKIE)
}

/**
 * Store PKCE code verifier during OAuth login.
 * @param verifier - Random PKCE verifier string
 */
export const setPkceVerifier = async (verifier: string): Promise<void> => {
  const cookieStore = await cookies()
  cookieStore.set(VERIFIER_COOKIE, verifier, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
}

/**
 * Read PKCE verifier cookie.
 */
export const getPkceVerifier = async (): Promise<string | null> => {
  const cookieStore = await cookies()
  return cookieStore.get(VERIFIER_COOKIE)?.value ?? null
}

/** Cookie name checked by edge middleware. */
export const sessionCookieName = SESSION_COOKIE
