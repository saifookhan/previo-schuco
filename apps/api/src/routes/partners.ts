import { partnersResponseSchema, type PartnerStatus } from '@schuco/contracts'
import { Hono, type Context } from 'hono'

import type { TenantContext } from '../lib/tenant-db'
import { isUuid } from '../lib/uuid'
import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requirePermission } from '../middleware/auth'
import {
  acceptConnectionRequest,
  getPartners,
  PartnerConflictError,
  PartnerNotFoundError,
  rejectConnectionRequest,
  removeConnection,
  requestConnection,
  type PartnerActor,
} from '../services/partners-service'

/** Partners page: connections between the caller's company and its clients and suppliers. */
export const partners = new Hono<{ Variables: AuthVariables }>()

partners.get('/', requireAuth, requirePermission('partners.manage'), async (c) => {
  const result = await getPartners({ effectiveCompanyId: c.get('effectiveCompanyId'), isSuperAdmin: c.get('isSuperAdmin') })
  return c.json(partnersResponseSchema.parse(result))
})

type PartnerAction = (ctx: TenantContext, actor: PartnerActor, otherCompanyId: string) => Promise<PartnerStatus>

/** Runs one connection change for `:companyId` and answers with the new status. */
const respond = async (c: Context<{ Variables: AuthVariables }>, action: PartnerAction) => {
  const companyId = c.req.param('companyId')
  if (!companyId || !isUuid(companyId)) {
    return c.json({ error: 'Company not found' }, 404)
  }
  try {
    const status = await action(
      { effectiveCompanyId: c.get('effectiveCompanyId'), isSuperAdmin: c.get('isSuperAdmin') },
      { actorUserId: c.get('actorUserId'), actorCompanyId: c.get('user').company.id, requestId: c.get('requestId') },
      companyId,
    )
    return c.json({ status })
  } catch (error) {
    if (error instanceof PartnerNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    if (error instanceof PartnerConflictError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
}

/** Ask a company to connect (accepts its request instead if it already asked). */
partners.post('/:companyId/request', requireAuth, requirePermission('partners.manage'), (c) => respond(c, requestConnection))

/** Accept the request a company sent. */
partners.post('/:companyId/accept', requireAuth, requirePermission('partners.manage'), (c) => respond(c, acceptConnectionRequest))

/** Refuse the request a company sent. */
partners.post('/:companyId/reject', requireAuth, requirePermission('partners.manage'), (c) => respond(c, rejectConnectionRequest))

/** Withdraw my request, or remove the connection (also stops the family shares between the two). */
partners.delete('/:companyId', requireAuth, requirePermission('partners.manage'), (c) => respond(c, removeConnection))
