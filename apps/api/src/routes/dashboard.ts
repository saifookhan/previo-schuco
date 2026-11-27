import { Hono } from 'hono'

import { dashboardPeriodSchema } from '@schuco/contracts'

import { dashboardScopeForRoles } from '../dashboard/aggregate'
import { isUuid } from '../lib/uuid'
import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requirePermission } from '../middleware/auth'
import { getDashboard } from '../services/dashboard-service'

/**
 * Sales dashboard. `quote.view`.
 *
 * `period` is `week` (default, Thursday–Wednesday), `month` or `year`, in Europe/Rome.
 * `includeTest=1` keeps quotes whose customer or reference starts with "TEST";
 * they are hidden otherwise. `salespersonId` filters the company view to one creator
 * and is ignored for a sales associate, who only ever sees their own quotes.
 */
export const dashboard = new Hono<{ Variables: AuthVariables }>()

dashboard.get('/', requireAuth, requirePermission('quote.view'), async (c) => {
  const period = dashboardPeriodSchema.safeParse(c.req.query('period') ?? 'week')
  if (!period.success) {
    return c.json({ error: 'Invalid period' }, 400)
  }
  const salespersonId = c.req.query('salespersonId')
  if (salespersonId !== undefined && salespersonId !== '' && !isUuid(salespersonId)) {
    return c.json({ error: 'Invalid salespersonId' }, 400)
  }
  const user = c.get('user')
  const scope = dashboardScopeForRoles(user.roles.map((role) => role.id))
  const includeTest = c.req.query('includeTest')
  const body = await getDashboard(
    { effectiveCompanyId: c.get('effectiveCompanyId'), isSuperAdmin: c.get('isSuperAdmin') },
    {
      period: period.data,
      includeTestQuotes: includeTest === '1' || includeTest === 'true',
      scope,
      actorUserId: c.get('actorUserId'),
      salespersonId: scope === 'company' && salespersonId ? salespersonId : null,
    },
  )
  return c.json(body)
})
