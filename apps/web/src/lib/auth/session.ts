import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

import { authConfig } from './config'

const SESSION_COOKIE = 'previo_session'

export interface SessionPayload {
  /** The user's own `users.id` — this is also the raw claim apps/api's requireAuth verifies (see its lib/session-jwt.ts). */
  sub: string
  email: string
  name?: string
  /** True for the seeded dev-login users (see /api/auth/dev-login) — those aren't real JWT-verified sessions on the API side, they use X-Dev-User-Sub instead (see buildAuthHeaders). */
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
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
    expires: new Date(exp * 1000),
  })
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

/** Clear the session cookie. */
export const clearSession = async (): Promise<void> => {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

/** Cookie name checked by edge middleware. */
export const sessionCookieName = SESSION_COOKIE
