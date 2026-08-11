import { DEMO_PRODUCTS } from '@schuco/db'
import { Hono } from 'hono'

import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requireRoles } from '../middleware/auth'

const quoteRoles = ['super-admin', 'company-admin', 'super-user', 'user']

/** Product catalog routes. */
export const products = new Hono<{ Variables: AuthVariables }>()

products.get('/', requireAuth, requireRoles(quoteRoles), (c) => c.json(DEMO_PRODUCTS))
