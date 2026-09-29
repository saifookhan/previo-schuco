import {
  loginRequestSchema,
  loginResponseSchema,
  requestPasswordResetRequestSchema,
  setPasswordRequestSchema,
  setPasswordResponseSchema,
} from '@schuco/contracts'
import { Hono } from 'hono'

import {
  AccountNotActiveError,
  InvalidCredentialsError,
  InvalidTokenError,
  WeakPasswordError,
  consumeAuthToken,
  login,
  requestPasswordReset,
} from '../services/auth-service'

/**
 * Unauthenticated auth endpoints — how a caller *gets* the session JWT
 * apps/web mints and every other route's `requireAuth` verifies. Never
 * behind `requireAuth`/`requireRoles` (that would be circular).
 */
export const auth = new Hono()

/** Verifies email+password. On success, returns the full profile — apps/web's own route mints and sets the session cookie from this. */
auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsedBody = loginRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return c.json({ error: 'Invalid request body', details: parsedBody.error.issues }, 400)
  }

  try {
    const profile = await login(parsedBody.data.email, parsedBody.data.password)
    const parsed = loginResponseSchema.safeParse({ user: profile })
    if (!parsed.success) {
      return c.json({ error: 'Internal response validation failed' }, 500)
    }
    return c.json(parsed.data)
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return c.json({ error: error.message }, 401)
    }
    if (error instanceof AccountNotActiveError) {
      return c.json({ error: error.message }, 403)
    }
    throw error
  }
})

/** Consumes an invite-accept or password-reset token and sets the new password — same endpoint for both (the token itself says which one it is). */
auth.post('/set-password', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsedBody = setPasswordRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return c.json({ error: 'Invalid request body', details: parsedBody.error.issues }, 400)
  }

  try {
    const profile = await consumeAuthToken(parsedBody.data.token, parsedBody.data.password)
    const parsed = setPasswordResponseSchema.safeParse({ user: profile })
    if (!parsed.success) {
      return c.json({ error: 'Internal response validation failed' }, 500)
    }
    return c.json(parsed.data)
  } catch (error) {
    if (error instanceof InvalidTokenError) {
      return c.json({ error: error.message }, 400)
    }
    if (error instanceof WeakPasswordError) {
      return c.json({ error: error.message }, 400)
    }
    throw error
  }
})

/** Requests a password-reset email. Always 200 — never reveals whether the email exists (see auth-service.ts). */
auth.post('/request-password-reset', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsedBody = requestPasswordResetRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return c.json({ error: 'Invalid request body', details: parsedBody.error.issues }, 400)
  }

  await requestPasswordReset(parsedBody.data.email)
  return c.json({ ok: true })
})
