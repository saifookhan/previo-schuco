import { isDevLoginAllowed as readDevLoginAllowed } from '@schuco/env/dev-login'

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

/**
 * Server-side gate for POST /api/auth/dev-login and for forwarding a
 * dev-login session to the API. Same rule as `@schuco/env/dev-login`.
 */
export const isDevLoginAllowed = (): boolean => readDevLoginAllowed()
