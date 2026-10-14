import { deleteCatalogLink, getCompanyById, insertCatalogLink, listCatalogLinks, type CatalogLinkRow } from '@schuco/db'

import { withTenantDb, type TenantContext } from '../lib/tenant-db'
import { recordAuditEvent } from './audit-service'

/** A link request breaks a rule (not a manufacturer, partner not a supplier/client, same company, unknown company). */
export class CatalogLinkValidationError extends Error {}

/** The link to remove doesn't exist. */
export class CatalogLinkNotFoundError extends Error {}

export interface CatalogLinkActor {
  actorUserId: string
  actorCompanyId: string
  requestId?: string | null
}

const auditActor = (actor: CatalogLinkActor) => ({
  actorType: 'user' as const,
  actorUserId: actor.actorUserId,
  actorCompanyId: actor.actorCompanyId,
  requestId: actor.requestId,
})

/** Lists every catalog link on the platform (super-admin view). */
export const listLinks = (ctx: TenantContext): Promise<CatalogLinkRow[]> => withTenantDb(ctx, (tx) => listCatalogLinks(tx))

/**
 * Shares a manufacturer's published catalog with a supplier or client.
 * Idempotent: re-adding an existing pair changes nothing.
 * @throws {CatalogLinkValidationError} unknown company, manufacturer lacks the capability, partner is neither supplier nor client, or both are the same company
 */
export const addLink = async (
  ctx: TenantContext,
  actor: CatalogLinkActor,
  manufacturerCompanyId: string,
  partnerCompanyId: string,
): Promise<void> => {
  if (manufacturerCompanyId === partnerCompanyId) {
    throw new CatalogLinkValidationError('A company cannot be linked to itself')
  }
  await withTenantDb(ctx, async (tx) => {
    const [manufacturer, partner] = await Promise.all([
      getCompanyById(tx, manufacturerCompanyId),
      getCompanyById(tx, partnerCompanyId),
    ])
    if (!manufacturer || !partner) {
      throw new CatalogLinkValidationError('Unknown company')
    }
    if (!manufacturer.capabilities.manufacturer) {
      throw new CatalogLinkValidationError(`'${manufacturer.name}' is not a manufacturer`)
    }
    if (!partner.capabilities.supplier && !partner.capabilities.client) {
      throw new CatalogLinkValidationError(`'${partner.name}' is neither a supplier nor a client`)
    }
    const created = await insertCatalogLink(tx, manufacturerCompanyId, partnerCompanyId)
    if (!created) {
      return // already linked — nothing changed, so nothing to audit
    }
    await recordAuditEvent(tx, auditActor(actor), manufacturerCompanyId, {
      action: 'catalog_link.create',
      resourceType: 'catalog_link',
      resourceId: partnerCompanyId,
      metadata: { manufacturerCompanyId, partnerCompanyId },
    })
  })
}

/** Stops sharing a manufacturer's catalog with a partner. */
export const removeLink = async (
  ctx: TenantContext,
  actor: CatalogLinkActor,
  manufacturerCompanyId: string,
  partnerCompanyId: string,
): Promise<void> => {
  await withTenantDb(ctx, async (tx) => {
    const removed = await deleteCatalogLink(tx, manufacturerCompanyId, partnerCompanyId)
    if (!removed) {
      throw new CatalogLinkNotFoundError('Link not found')
    }
    await recordAuditEvent(tx, auditActor(actor), manufacturerCompanyId, {
      action: 'catalog_link.delete',
      resourceType: 'catalog_link',
      resourceId: partnerCompanyId,
      metadata: { manufacturerCompanyId, partnerCompanyId },
    })
  })
}
