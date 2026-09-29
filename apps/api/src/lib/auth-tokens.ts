import { createHash, randomBytes } from 'node:crypto'

/** A fresh opaque token: the raw value goes in the email link, only its hash is ever stored (see auth_tokens' schema doc). */
export const generateRawToken = (): string => randomBytes(32).toString('base64url')

/** SHA-256 is fine here (not bcrypt) — this isn't a low-entropy secret an attacker can brute-force offline like a password; it's a 256-bit random value, so a fast, deterministic hash is exactly what a lookup-by-hash needs. */
export const hashToken = (rawToken: string): string => createHash('sha256').update(rawToken).digest('hex')

/** How long an invite-accept or password-reset link stays valid. */
export const AUTH_TOKEN_TTL_MS = {
  invite: 7 * 24 * 60 * 60 * 1000, // 7 days
  password_reset: 60 * 60 * 1000, // 1 hour
} as const
