import {
  insertCompany,
  listAllCompanies,
  setCompanyActive,
  updateCompany,
  type CompanyRow,
} from '@schuco/db'

import { withTenantDb, type TenantContext } from '../lib/tenant-db'
import { recordAuditEvent } from './audit-service'

/** Platform-wide company management for super-admins (ADR 0012). Deactivating (not deleting) a company blocks every one of its users from logging in — see requireAuth — without cascading a DELETE through its catalog/quotes. */

export interface CompanyActor {
  actorUserId: string
  actorCompanyId: string
  requestId?: string | null
}

export interface CreateCompanyInput {
  type: 'platform' | 'supplier' | 'client'
  name: string
  vatNumber: string
}

/** Creates a new company. Deliberately unscoped by `ctx.effectiveCompanyId` — RLS's `app_is_super_admin()` grants the write regardless of it. */
export const createCompany = async (
  ctx: TenantContext,
  actor: CompanyActor,
  input: CreateCompanyInput,
): Promise<CompanyRow> =>
  withTenantDb(ctx, async (tx) => {
    const company = await insertCompany(tx, input)
    await recordAuditEvent(
      tx,
      { actorType: 'user', actorUserId: actor.actorUserId, actorCompanyId: actor.actorCompanyId, requestId: actor.requestId },
      actor.actorCompanyId,
      { action: 'company.create', resourceType: 'company', resourceId: company.id, metadata: { name: input.name, type: input.type } },
    )
    return company
  })

/** Lists every company on the platform. */
export const listCompanies = (ctx: TenantContext): Promise<CompanyRow[]> => withTenantDb(ctx, (tx) => listAllCompanies(tx))

export interface UpdateCompanyInput {
  type?: 'platform' | 'supplier' | 'client'
  name?: string
  vatNumber?: string
}

/** The company id doesn't exist (or isn't visible — a non-super-admin caller, which `requireRoles` should already have blocked). */
export class CompanyNotFoundError extends Error {}

export const updateCompanyDetails = async (
  ctx: TenantContext,
  actor: CompanyActor,
  companyId: string,
  input: UpdateCompanyInput,
): Promise<CompanyRow> =>
  withTenantDb(ctx, async (tx) => {
    const company = await updateCompany(tx, companyId, input)
    if (!company) {
      throw new CompanyNotFoundError(`Company '${companyId}' not found`)
    }
    await recordAuditEvent(
      tx,
      { actorType: 'user', actorUserId: actor.actorUserId, actorCompanyId: actor.actorCompanyId, requestId: actor.requestId },
      actor.actorCompanyId,
      { action: 'company.update', resourceType: 'company', resourceId: companyId, metadata: input },
    )
    return company
  })

export const setCompanyActiveStatus = async (
  ctx: TenantContext,
  actor: CompanyActor,
  companyId: string,
  isActive: boolean,
): Promise<CompanyRow> =>
  withTenantDb(ctx, async (tx) => {
    const company = await setCompanyActive(tx, companyId, isActive)
    if (!company) {
      throw new CompanyNotFoundError(`Company '${companyId}' not found`)
    }
    await recordAuditEvent(
      tx,
      { actorType: 'user', actorUserId: actor.actorUserId, actorCompanyId: actor.actorCompanyId, requestId: actor.requestId },
      actor.actorCompanyId,
      { action: isActive ? 'company.activate' : 'company.deactivate', resourceType: 'company', resourceId: companyId, metadata: {} },
    )
    return company
  })
