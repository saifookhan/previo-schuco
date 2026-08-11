import { Hono } from 'hono'

import type { AuthVariables } from '../middleware/auth'
import { requireAuth } from '../middleware/auth'

const me = new Hono<{ Variables: AuthVariables }>()

/**
 * Current authenticated user profile with RBAC context.
 */
me.get('/', requireAuth, (c) => {
  const user = c.get('user')
  return c.json({ user })
})

export { me }
