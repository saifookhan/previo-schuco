import { calculateQuote } from '@schuco/calculation'
import { quoteConfigurationSchema, type QuoteConfiguration } from '@schuco/contracts'
import { Hono } from 'hono'

import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requireRoles } from '../middleware/auth'

const quoteRoles = ['super-admin', 'company-admin', 'super-user', 'user']

/** Quote pricing calculation. */
export const calculate = new Hono<{ Variables: AuthVariables }>()

calculate.post('/', requireAuth, requireRoles(quoteRoles), async (c) => {
  const body: unknown = await c.req.json()
  const parsed = quoteConfigurationSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400)
  }

  const result = calculateQuote(parsed.data as QuoteConfiguration)
  return c.json(result)
})
