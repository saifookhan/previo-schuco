import type { Context, Next } from 'hono'
import {
  getUserProfileByCognitoSub,
  setRlsContext,
  syncUserFromCognito,
  type UserProfile,
} from '@schuco/db'

import { getCognitoConfig, parseBearerToken, verifyCognitoToken } from '../lib/cognito'
import { getDb } from '../lib/db'

export type AuthVariables = {
  user: UserProfile
}

const DEV_SUB_HEADER = 'x-dev-user-sub'

/**
 * Resolve dev-mode user sub when Cognito is not configured.
 * @param c - Hono context
 */
const resolveDevSub = (c: Context): string | null => {
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  return c.req.header(DEV_SUB_HEADER) ?? null
}

/**
 * Require authenticated user via Cognito JWT or dev header.
 */
export const requireAuth = async (c: Context, next: Next): Promise<Response | void> => {
  const cognitoConfig = getCognitoConfig()
  let cognitoSub: string | null = null
  let email: string | undefined
  let name: string | undefined

  if (cognitoConfig) {
    const token = parseBearerToken(c.req.header('Authorization'))
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    try {
      const payload = await verifyCognitoToken(token)
      cognitoSub = payload.sub
      email = typeof payload.email === 'string' ? payload.email : undefined
      name = typeof payload.name === 'string' ? payload.name : undefined
    } catch {
      return c.json({ error: 'Invalid token' }, 401)
    }
  } else {
    cognitoSub = resolveDevSub(c)
    if (!cognitoSub) {
      return c.json({ error: 'Unauthorized — set Authorization Bearer or X-Dev-User-Sub' }, 401)
    }
  }

  const db = getDb()
  let profile = await getUserProfileByCognitoSub(db, cognitoSub)

  if (!profile && email) {
    profile = await syncUserFromCognito(db, { cognitoSub, email, name })
  }

  if (!profile) {
    return c.json({ error: 'User not provisioned in PREVIO' }, 403)
  }

  if (profile.status !== 'active') {
    return c.json({ error: 'User account inactive' }, 403)
  }

  await setRlsContext(
    db,
    profile.company.id,
    profile.role.id === 'super-admin',
  )

  c.set('user', profile)
  await next()
}

/**
 * Require minimum role level for protected routes.
 * @param allowedRoles - Role IDs permitted to access the route
 */
export const requireRoles = (allowedRoles: string[]) =>
  async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get('user') as UserProfile | undefined
    if (!user || !allowedRoles.includes(user.role.id)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  }
