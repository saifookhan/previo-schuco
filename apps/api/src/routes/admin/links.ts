import {
  catalogLinksListResponseSchema,
  createCatalogLinkRequestSchema,
  type CatalogLinkDto,
} from '@schuco/contracts'
import type { CatalogLinkRow } from '@schuco/db'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthVariables } from '../../middleware/auth'
import { requireAuth, requirePermission } from '../../middleware/auth'
import {
  CatalogLinkNotFoundError,
  CatalogLinkValidationError,
  addLink,
  listLinks,
  removeLink,
  type CatalogLinkActor,
} from '../../services/catalog-links-service'

/** Platform-wide management of which manufacturer catalogs are shared with which suppliers/clients (super-admin). */
export const adminLinks = new Hono<{ Variables: AuthVariables }>()

const ctxFrom = (c: Context<{ Variables: AuthVariables }>) => ({
  effectiveCompanyId: c.get('effectiveCompanyId'),
  isSuperAdmin: c.get('isSuperAdmin'),
})

const actorFrom = (c: Context<{ Variables: AuthVariables }>): CatalogLinkActor => ({
  actorUserId: c.get('actorUserId'),
  actorCompanyId: c.get('user').company.id,
  requestId: c.get('requestId'),
})

const toDto = (row: CatalogLinkRow): CatalogLinkDto => ({
  manufacturerCompanyId: row.manufacturerCompanyId,
  manufacturerName: row.manufacturerName,
  partnerCompanyId: row.partnerCompanyId,
  partnerName: row.partnerName,
  createdAt: row.createdAt.toISOString(),
})

adminLinks.get('/', requireAuth, requirePermission('links.manage'), async (c) => {
  const rows = await listLinks(ctxFrom(c))
  const parsed = catalogLinksListResponseSchema.safeParse({ links: rows.map(toDto) })
  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }
  return c.json(parsed.data)
})

adminLinks.post('/', requireAuth, requirePermission('links.manage'), async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsedBody = createCatalogLinkRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return c.json({ error: 'Invalid request body', details: parsedBody.error.issues }, 400)
  }
  try {
    await addLink(ctxFrom(c), actorFrom(c), parsedBody.data.manufacturerCompanyId, parsedBody.data.partnerCompanyId)
  } catch (error) {
    if (error instanceof CatalogLinkValidationError) {
      return c.json({ error: error.message }, 400)
    }
    throw error
  }
  return c.json({ ok: true }, 201)
})

adminLinks.delete('/:manufacturerId/:partnerId', requireAuth, requirePermission('links.manage'), async (c) => {
  const ids = z
    .object({ manufacturerId: z.string().uuid(), partnerId: z.string().uuid() })
    .safeParse({ manufacturerId: c.req.param('manufacturerId'), partnerId: c.req.param('partnerId') })
  if (!ids.success) {
    return c.json({ error: 'Invalid id' }, 400)
  }
  try {
    await removeLink(ctxFrom(c), actorFrom(c), ids.data.manufacturerId, ids.data.partnerId)
  } catch (error) {
    if (error instanceof CatalogLinkNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    throw error
  }
  return c.json({ ok: true })
})
