import {
  companiesListResponseSchema,
  createCompanyRequestSchema,
  createCompanyResponseSchema,
  setCompanyActiveRequestSchema,
  updateCompanyRequestSchema,
  updateCompanyResponseSchema,
} from '@schuco/contracts'
import type { Context } from 'hono'
import { Hono } from 'hono'

import { toCompanyDto } from '../../lib/company-dto'
import type { AuthVariables } from '../../middleware/auth'
import { requireAuth, requireRoles } from '../../middleware/auth'
import {
  CompanyNotFoundError,
  createCompany,
  listCompanies,
  setCompanyActiveStatus,
  updateCompanyDetails,
  type CompanyActor,
} from '../../services/companies-service'

/** Platform-wide company CRUD for super-admins — create/list/update/deactivate. No hard delete: a company's users/catalog/quotes cascade off it (see the companies-service module doc). */
export const adminCompanies = new Hono<{ Variables: AuthVariables }>()

const ctxFrom = (c: Context<{ Variables: AuthVariables }>) => ({
  effectiveCompanyId: c.get('effectiveCompanyId'),
  isSuperAdmin: c.get('isSuperAdmin'),
})

const actorFrom = (c: Context<{ Variables: AuthVariables }>): CompanyActor => ({
  actorUserId: c.get('actorUserId'),
  actorCompanyId: c.get('user').company.id,
  requestId: c.get('requestId'),
})

adminCompanies.get('/', requireAuth, requireRoles(['super-admin']), async (c) => {
  const rows = await listCompanies(ctxFrom(c))
  const parsed = companiesListResponseSchema.safeParse({ companies: rows.map(toCompanyDto) })
  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }
  return c.json(parsed.data)
})

adminCompanies.post('/', requireAuth, requireRoles(['super-admin']), async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsedBody = createCompanyRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return c.json({ error: 'Invalid request body', details: parsedBody.error.issues }, 400)
  }

  const company = await createCompany(ctxFrom(c), actorFrom(c), parsedBody.data)
  const parsed = createCompanyResponseSchema.safeParse({ company: toCompanyDto(company) })
  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }
  return c.json(parsed.data, 201)
})

adminCompanies.patch('/:id', requireAuth, requireRoles(['super-admin']), async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const body = await c.req.json().catch(() => null)
  const parsedBody = updateCompanyRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return c.json({ error: 'Invalid request body', details: parsedBody.error.issues }, 400)
  }

  try {
    const company = await updateCompanyDetails(ctxFrom(c), actorFrom(c), id, parsedBody.data)
    const parsed = updateCompanyResponseSchema.safeParse({ company: toCompanyDto(company) })
    if (!parsed.success) {
      return c.json({ error: 'Internal response validation failed' }, 500)
    }
    return c.json(parsed.data)
  } catch (error) {
    if (error instanceof CompanyNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    throw error
  }
})

adminCompanies.patch('/:id/active', requireAuth, requireRoles(['super-admin']), async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const body = await c.req.json().catch(() => null)
  const parsedBody = setCompanyActiveRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return c.json({ error: 'Invalid request body', details: parsedBody.error.issues }, 400)
  }

  try {
    const company = await setCompanyActiveStatus(ctxFrom(c), actorFrom(c), id, parsedBody.data.isActive)
    const parsed = updateCompanyResponseSchema.safeParse({ company: toCompanyDto(company) })
    if (!parsed.success) {
      return c.json({ error: 'Internal response validation failed' }, 500)
    }
    return c.json(parsed.data)
  } catch (error) {
    if (error instanceof CompanyNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    throw error
  }
})
