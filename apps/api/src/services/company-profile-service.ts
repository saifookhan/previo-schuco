import {
  deleteBusinessUnit,
  deleteQuoteTextTemplate,
  getCompanyProfile as getCompanyProfileQuery,
  insertBusinessUnit,
  insertQuoteTextTemplate,
  listBusinessUnitsWithUsers,
  listQuoteTextTemplates,
  listSalesContacts,
  setBusinessUnitUsers,
  updateBusinessUnit as updateBusinessUnitQuery,
  updateCompanyProfile as updateCompanyProfileQuery,
  updateQuoteTextTemplate,
  updateUserPhone,
  type BusinessUnitRow,
  type DbLike,
  type QuoteTextTemplateRow,
} from '@schuco/db'
import type {
  BusinessUnit,
  BusinessUnitInput,
  CompanyProfileUpdate,
  CompanyProfileResponse,
  TextTemplate,
  TextTemplateInput,
} from '@schuco/contracts'

import { sanitizeRichText } from '../lib/sanitize-rich-text'
import { withTenantDb, type TenantContext } from '../lib/tenant-db'
import { recordAuditEvent } from './audit-service'

export interface ProfileActor {
  actorUserId: string
  actorCompanyId: string
  requestId?: string | null
}

/** A user id that isn't an active user of the company. */
export class CompanyProfileValidationError extends Error {}

const auditActor = (actor: ProfileActor) => ({
  actorType: 'user' as const,
  actorUserId: actor.actorUserId,
  actorCompanyId: actor.actorCompanyId,
  requestId: actor.requestId,
})

const toBusinessUnit = (row: BusinessUnitRow & { userIds: string[] }): BusinessUnit => ({
  id: row.id,
  name: row.name,
  address: row.address,
  email: row.email,
  phone: row.phone,
  primaryColor: row.primaryColor,
  logoDataUrl: row.logoUrl,
  userIds: row.userIds,
})

const toTextTemplate = (row: QuoteTextTemplateRow): TextTemplate => ({
  id: row.id,
  name: row.name,
  html: row.html,
  updatedAt: row.updatedAt.toISOString(),
})

const loadProfile = async (tx: DbLike, companyId: string, withLogos = true): Promise<CompanyProfileResponse | null> => {
  const profile = await getCompanyProfileQuery(tx, companyId)
  if (!profile) return null
  return {
    profile,
    businessUnits: (await listBusinessUnitsWithUsers(tx, companyId, { withLogos })).map(toBusinessUnit),
    salesContacts: await listSalesContacts(tx, companyId),
  }
}

/**
 * The company's profile, branches and possible sales contacts; null when the company isn't visible.
 * Without `withLogos` the branches' `logoDataUrl` is null (the quote editor only needs their names).
 */
export const getCompanyProfile = (ctx: TenantContext, { withLogos = true }: { withLogos?: boolean } = {}): Promise<CompanyProfileResponse | null> =>
  withTenantDb(ctx, (tx) => loadProfile(tx, ctx.effectiveCompanyId, withLogos))

export const updateCompanyProfile = (
  ctx: TenantContext,
  actor: ProfileActor,
  input: CompanyProfileUpdate,
): Promise<CompanyProfileResponse | null> =>
  withTenantDb(ctx, async (tx) => {
    // Field by field, so a legal name or VAT number in the input is never written.
    const { fiscalAddress, fiscalCode, sdiCode, email, pecEmail, phone } = input
    const updated = await updateCompanyProfileQuery(tx, ctx.effectiveCompanyId, { fiscalAddress, fiscalCode, sdiCode, email, pecEmail, phone })
    if (!updated) return null
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'company.profile_update',
      resourceType: 'company',
      resourceId: ctx.effectiveCompanyId,
    })
    return loadProfile(tx, ctx.effectiveCompanyId)
  })

/** @throws {CompanyProfileValidationError} a user id that isn't an active user of the company */
const assertCompanyUsers = async (tx: DbLike, companyId: string, userIds: string[]): Promise<void> => {
  const known = new Set((await listSalesContacts(tx, companyId)).map((contact) => contact.id))
  if (userIds.some((id) => !known.has(id))) {
    throw new CompanyProfileValidationError('Every user of a branch must be an active user of the company')
  }
}

const unitFields = (input: BusinessUnitInput) => ({
  name: input.name,
  address: input.address,
  email: input.email,
  phone: input.phone,
  primaryColor: input.primaryColor,
  logoUrl: input.logoDataUrl,
})

/** Adds a branch. @throws {CompanyProfileValidationError} see `assertCompanyUsers` */
export const createBusinessUnit = (ctx: TenantContext, actor: ProfileActor, input: BusinessUnitInput): Promise<CompanyProfileResponse> =>
  withTenantDb(ctx, async (tx) => {
    const userIds = [...new Set(input.userIds)]
    await assertCompanyUsers(tx, ctx.effectiveCompanyId, userIds)
    const unit = await insertBusinessUnit(tx, ctx.effectiveCompanyId, unitFields(input))
    await setBusinessUnitUsers(tx, unit.id, userIds)
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'business_unit.create',
      resourceType: 'business_unit',
      resourceId: unit.id,
      metadata: { name: unit.name },
    })
    return (await loadProfile(tx, ctx.effectiveCompanyId))!
  })

/** Updates a branch; null when the company has no such branch. @throws {CompanyProfileValidationError} see `assertCompanyUsers` */
export const updateBusinessUnit = (
  ctx: TenantContext,
  actor: ProfileActor,
  id: string,
  input: BusinessUnitInput,
): Promise<CompanyProfileResponse | null> =>
  withTenantDb(ctx, async (tx) => {
    const userIds = [...new Set(input.userIds)]
    await assertCompanyUsers(tx, ctx.effectiveCompanyId, userIds)
    const unit = await updateBusinessUnitQuery(tx, ctx.effectiveCompanyId, id, unitFields(input))
    if (!unit) return null
    await setBusinessUnitUsers(tx, unit.id, userIds)
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'business_unit.update',
      resourceType: 'business_unit',
      resourceId: unit.id,
      metadata: { name: unit.name },
    })
    return loadProfile(tx, ctx.effectiveCompanyId)
  })

/** Deletes a branch; null when the company has no such branch. Quotes that printed under it fall back to the company's first branch. */
export const removeBusinessUnit = (ctx: TenantContext, actor: ProfileActor, id: string): Promise<CompanyProfileResponse | null> =>
  withTenantDb(ctx, async (tx) => {
    if (!(await deleteBusinessUnit(tx, ctx.effectiveCompanyId, id))) return null
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'business_unit.delete',
      resourceType: 'business_unit',
      resourceId: id,
    })
    return loadProfile(tx, ctx.effectiveCompanyId)
  })

/** Sets the phone printed for a sales contact; null when they aren't an active user of the company. */
export const setSalesContactPhone = (
  ctx: TenantContext,
  actor: ProfileActor,
  userId: string,
  phone: string | null,
): Promise<CompanyProfileResponse | null> =>
  withTenantDb(ctx, async (tx) => {
    const contacts = await listSalesContacts(tx, ctx.effectiveCompanyId)
    if (!contacts.some((contact) => contact.id === userId)) return null
    await updateUserPhone(tx, userId, phone)
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'user.phone_update',
      resourceType: 'user',
      resourceId: userId,
    })
    return loadProfile(tx, ctx.effectiveCompanyId)
  })

// ── Saved texts ───────────────────────────────────────────────────────────────

export const listTextTemplates = (ctx: TenantContext): Promise<TextTemplate[]> =>
  withTenantDb(ctx, async (tx) => (await listQuoteTextTemplates(tx, ctx.effectiveCompanyId)).map(toTextTemplate))

export const createTextTemplate = (ctx: TenantContext, input: TextTemplateInput): Promise<TextTemplate> =>
  withTenantDb(ctx, async (tx) =>
    toTextTemplate(
      await insertQuoteTextTemplate(tx, { companyId: ctx.effectiveCompanyId, name: input.name, html: sanitizeRichText(input.html) }),
    ),
  )

/** Null when the company has no such saved text. */
export const updateTextTemplate = (ctx: TenantContext, id: string, input: TextTemplateInput): Promise<TextTemplate | null> =>
  withTenantDb(ctx, async (tx) => {
    const row = await updateQuoteTextTemplate(tx, ctx.effectiveCompanyId, id, { name: input.name, html: sanitizeRichText(input.html) })
    return row ? toTextTemplate(row) : null
  })

/** False when the company has no such saved text. */
export const removeTextTemplate = (ctx: TenantContext, id: string): Promise<boolean> =>
  withTenantDb(ctx, (tx) => deleteQuoteTextTemplate(tx, ctx.effectiveCompanyId, id))
