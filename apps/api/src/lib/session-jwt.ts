import { jwtVerify } from 'jose'

export interface SessionJwtPayload {
  /** The user's own `users.id` — apps/web mints this JWT straight from a DB user, no external identity provider in between (unlike the old Cognito `sub`). */
  sub: string
}

const getSecretKey = (): Uint8Array => {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET is not configured — required to verify session JWTs (shared with apps/web)')
  }
  return new TextEncoder().encode(secret)
}

/** Extracts the token from an `Authorization: Bearer <token>` header value. */
export const parseBearerToken = (header: string | undefined): string | null => {
  if (!header?.startsWith('Bearer ')) {
    return null
  }
  return header.slice(7).trim() || null
}

/**
 * Verifies a session JWT minted by apps/web (see its lib/auth/session.ts
 * — same `AUTH_SECRET`, same HS256 scheme). This is what `requireAuth`
 * uses for the `Authorization: Bearer <token>` path now that there's no
 * external identity provider to delegate verification to.
 * @param token - Raw JWT string from the Authorization header
 * @returns The decoded payload, or null if invalid/expired
 */
export const verifySessionJwt = async (token: string): Promise<SessionJwtPayload | null> => {
  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    if (typeof payload.sub !== 'string' || !payload.sub) {
      return null
    }
    return { sub: payload.sub }
  } catch {
    return null
  }
}
