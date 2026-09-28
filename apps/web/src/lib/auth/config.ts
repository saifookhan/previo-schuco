/**
 * App auth environment configuration. Cognito is gone (see the auth
 * rework this replaced) — the platform authenticates with our own
 * email+password + JWT session now.
 */
export const authConfig = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  authSecret: process.env.AUTH_SECRET ?? 'dev-insecure-secret-change-me',
}

/** Allow seed-user dev login on hosted previews (e.g. Vercel dev). Server-only check. */
export const isDevLoginAllowed = (): boolean =>
  process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_LOGIN === 'true'

/** Client-visible flag to show the dev-login form alongside real email+password login. */
export const isDevLoginUiEnabled = (): boolean => process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === 'true'
