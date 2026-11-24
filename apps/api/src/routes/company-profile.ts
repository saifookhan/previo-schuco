import type { Context } from 'hono'
import { Hono } from 'hono'

import { businessUnitInputSchema, companyProfileUpdateSchema, salesContactInputSchema, textTemplateInputSchema } from '@schuco/contracts'

import {
  CompanyProfileValidationError,
  createBusinessUnit,
  createTextTemplate,
  getCompanyProfile,
  listTextTemplates,
  removeBusinessUnit,
  removeTextTemplate,
  setSalesContactPhone,
  updateBusinessUnit,
  updateCompanyProfile,
  updateTextTemplate,
  type ProfileActor,
} from '../services/company-profile-service'
import { rejectNonUuidParams } from '../lib/uuid'
import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requirePermission } from '../middleware/auth'

/**
 * The caller's company as its quotes print it: fiscal data (page footer), branches with their
 * logo, colour and contacts (page header), the sales contacts' phones, and the saved texts a
 * quote's text modules start from. Anyone who quotes can read it; changing the profile,
 * branches and phones needs `users.manage`, the saved texts `quote.edit`.
 */
export const companyProfile = new Hono<{ Variables: AuthVariables }>()

const actorFrom = (c: Context<{ Variables: AuthVariables }>): ProfileActor => ({
  actorUserId: c.get('actorUserId'),
  actorCompanyId: c.get('user').company.id,
  requestId: c.get('requestId'),
})

const ctxFrom = (c: Context<{ Variables: AuthVariables }>) => ({
  effectiveCompanyId: c.get('effectiveCompanyId'),
  isSuperAdmin: c.get('isSuperAdmin'),
})

const invalid = (c: Context, issues: unknown) => c.json({ error: 'Invalid request', issues }, 400)

const validationResponse = (c: Context, error: unknown) => {
  if (error instanceof CompanyProfileValidationError) {
    return c.json({ error: error.message }, 400)
  }
  throw error
}

companyProfile.get('/profile', requireAuth, requirePermission('quote.view'), async (c) => {
  // `?logos=false` leaves the branches' logos out (data URLs, up to ~700 KB each).
  const profile = await getCompanyProfile(ctxFrom(c), { withLogos: c.req.query('logos') !== 'false' })
  return profile ? c.json(profile) : c.json({ error: 'Not found' }, 404)
})

companyProfile.put('/profile', requireAuth, requirePermission('users.manage'), async (c) => {
  const parsed = companyProfileUpdateSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c, parsed.error.issues)
  const profile = await updateCompanyProfile(ctxFrom(c), actorFrom(c), parsed.data)
  return profile ? c.json(profile) : c.json({ error: 'Not found' }, 404)
})

companyProfile.post('/business-units', requireAuth, requirePermission('users.manage'), async (c) => {
  const parsed = businessUnitInputSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c, parsed.error.issues)
  try {
    return c.json(await createBusinessUnit(ctxFrom(c), actorFrom(c), parsed.data), 201)
  } catch (error) {
    return validationResponse(c, error)
  }
})

companyProfile.put('/business-units/:unitId', rejectNonUuidParams, requireAuth, requirePermission('users.manage'), async (c) => {
  const parsed = businessUnitInputSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c, parsed.error.issues)
  try {
    const profile = await updateBusinessUnit(ctxFrom(c), actorFrom(c), c.req.param('unitId')!, parsed.data)
    return profile ? c.json(profile) : c.json({ error: 'Not found' }, 404)
  } catch (error) {
    return validationResponse(c, error)
  }
})

companyProfile.delete('/business-units/:unitId', rejectNonUuidParams, requireAuth, requirePermission('users.manage'), async (c) => {
  const profile = await removeBusinessUnit(ctxFrom(c), actorFrom(c), c.req.param('unitId')!)
  return profile ? c.json(profile) : c.json({ error: 'Not found' }, 404)
})

companyProfile.put('/sales-contacts/:userId', rejectNonUuidParams, requireAuth, requirePermission('users.manage'), async (c) => {
  const parsed = salesContactInputSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c, parsed.error.issues)
  const profile = await setSalesContactPhone(ctxFrom(c), actorFrom(c), c.req.param('userId')!, parsed.data.phone)
  return profile ? c.json(profile) : c.json({ error: 'Not found' }, 404)
})

companyProfile.get('/text-templates', requireAuth, requirePermission('quote.view'), async (c) => {
  return c.json({ templates: await listTextTemplates(ctxFrom(c)) })
})

companyProfile.post('/text-templates', requireAuth, requirePermission('quote.edit'), async (c) => {
  const parsed = textTemplateInputSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c, parsed.error.issues)
  return c.json(await createTextTemplate(ctxFrom(c), parsed.data), 201)
})

companyProfile.put('/text-templates/:templateId', rejectNonUuidParams, requireAuth, requirePermission('quote.edit'), async (c) => {
  const parsed = textTemplateInputSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c, parsed.error.issues)
  const template = await updateTextTemplate(ctxFrom(c), c.req.param('templateId')!, parsed.data)
  return template ? c.json(template) : c.json({ error: 'Not found' }, 404)
})

companyProfile.delete('/text-templates/:templateId', rejectNonUuidParams, requireAuth, requirePermission('quote.edit'), async (c) => {
  return (await removeTextTemplate(ctxFrom(c), c.req.param('templateId')!)) ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404)
})
