import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { authConfig } from './config'

const SESSION_COOKIE = 'previo_session'

export interface SessionPayload {
  /** The user's own `users.id` — this is also the raw claim apps/api's requireAuth verifies (see its lib/session-jwt.ts). */
  sub: string
  email: string
  name?: string
  /** True for the seeded dev-login users (see /api/auth/dev-login): `sub` is then the seeded `cognito_sub`, and the API only accepts the session while ALLOW_DEV_LOGIN is on. */
  isDevLogin: boolean
  exp: number
}

const getSecretKey = (): Uint8Array =>
  new TextEncoder().encode(authConfig.authSecret)

/**
 * Whether the session cookie gets the `Secure` flag. Defaults to
 * `NODE_ENV === 'production'`, but that default is wrong for a
 * production-mode deployment served over plain HTTP (e.g. a self-hosted
 * single server reached by IP, no reverse-proxy TLS yet) — a `Secure`
 * cookie is silently dropped by the browser over HTTP, so login would
 * appear to succeed but every subsequent request would look
 * unauthenticated. Set `COOKIE_SECURE=false` explicitly in that case.
 */
const cookieSecure = (): boolean =>
  process.env.COOKIE_SECURE === 'false' ? false : process.env.NODE_ENV === 'production'

/** Attributes shared by setting and clearing the session cookie. A clear that omits `path` or flips `secure` does not match the cookie the browser stored, so the session survives logout. */
const sessionCookieBase = (): {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: '/'
} => ({
  httpOnly: true,
  secure: cookieSecure(),
  sameSite: 'lax',
  path: '/',
})

/**
 * Sign and persist the session as an HTTP-only cookie. The signed JWT
 * string itself doubles as the Bearer token apps/api's `requireAuth`
 * verifies (see `getSessionToken`) — one token, not a session cookie
 * plus a separate access token, since we're not brokering identity
 * through anything external anymore.
 * @param payload - Session claims (no `exp` — set here, always the same TTL)
 */
export const setSession = async (payload: Omit<SessionPayload, 'exp'>): Promise<void> => {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 days
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(exp)
    .sign(getSecretKey())

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    ...sessionCookieBase(),
    expires: new Date(exp * 1000),
  })
}

/**
 * Expire the session cookie on `response` itself. Prefer this in route
 * handlers over `cookies().delete()`: that helper does not repeat `path`
 * / `secure` / `sameSite`, and Next can drop the side-channel write when
 * the handler returns its own `NextResponse`.
 */
export const attachClearedSession = (response: NextResponse): NextResponse => {
  response.cookies.set(SESSION_COOKIE, '', {
    ...sessionCookieBase(),
    maxAge: 0,
    expires: new Date(0),
  })
  return response
}

/** Read and verify the session cookie, decoded. */
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

/** The raw signed cookie value, for forwarding to apps/api as `Authorization: Bearer <token>` (see buildAuthHeaders) — never exposed to the browser, only read server-side. */
export const getSessionToken = async (): Promise<string | null> => {
  const cookieStore = await cookies()
  return cookieStore.get(SESSION_COOKIE)?.value ?? null
}

/** Cookie name checked by edge middleware. */
export const sessionCookieName = SESSION_COOKIE
