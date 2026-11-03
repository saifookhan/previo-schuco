import {
  getIncomingShareDiscounts,
  getProductFamilyDetail,
  isFamilySharedWith,
  listFamilyShareTargets,
  listOutgoingFamilyShares,
  lockConnectedCompanyIds,
  replaceOutgoingFamilyShares,
  withSystemTransaction,
  type FamilyShareRow,
  type FamilyShareTarget,
} from '@schuco/db'

import { getDb } from '../lib/db'
import { withTenantDb, type TenantContext } from '../lib/tenant-db'
import { recordAuditEvent } from './audit-service'

/** The family doesn't exist or the caller's company can't reach it (so can't share it). */
export class FamilyShareNotFoundError extends Error {}

/** A requested recipient breaks a rule (unknown/inactive, not a supplier or client, not connected with the sharer, or the family's owner). */
export class FamilyShareValidationError extends Error {}

export interface FamilyShareActor {
  actorUserId: string
  actorCompanyId: string
  requestId?: string | null
}

export interface FamilyShares {
  shares: FamilyShareRow[]
  targets: FamilyShareTarget[]
}

/** Companies that may receive a share of `ownerCompanyId`'s family from `sharerCompanyId`: its connected partners. Listed across tenants, so system-scoped — returns names only. */
const shareTargetsFor = async (ownerCompanyId: string, sharerCompanyId: string): Promise<FamilyShareTarget[]> => {
  const all = await withSystemTransaction(getDb(), (tx) => listFamilyShareTargets(tx, sharerCompanyId))
  return all.filter((company) => company.id !== ownerCompanyId)
}

/** The default discount this family was shared with the caller's company at, or null when it is the company's own or was shared at 0%. */
export const getFamilyShareDiscount = (ctx: TenantContext, familyId: string): Promise<number | null> =>
  withTenantDb(ctx, async (tx) => {
    const discounts = await getIncomingShareDiscounts(tx, ctx.effectiveCompanyId, [familyId])
    const discount = discounts.get(familyId)
    return discount && discount > 0 ? discount : null
  })

/**
 * The shares the caller's company made of this family, plus the companies it could add.
 * @throws {FamilyShareNotFoundError} unknown family, or one the caller's company cannot reach
 */
export const getFamilyShares = async (ctx: TenantContext, familyId: string): Promise<FamilyShares> => {
  const { ownerCompanyId, shares } = await withTenantDb(ctx, async (tx) => {
    const detail = await getProductFamilyDetail(tx, familyId)
    if (!detail || !(await isFamilySharedWith(tx, familyId, ctx.effectiveCompanyId))) {
      throw new FamilyShareNotFoundError('Product family not found')
    }
    return {
      ownerCompanyId: detail.family.supplierCompanyId,
      shares: await listOutgoingFamilyShares(tx, familyId, ctx.effectiveCompanyId),
    }
  })
  return { shares, targets: await shareTargetsFor(ownerCompanyId, ctx.effectiveCompanyId) }
}

/**
 * Replaces the set of companies the caller's company shares this family with
 * (each with a default discount). Only published families can be shared with new
 * companies. The sharer is the owner or any company that was itself shared the
 * family (onward sharing). Recipients must be connected with the sharer (Partners page).
 * @throws {FamilyShareNotFoundError} unknown family, or one the caller's company cannot reach
 * @throws {FamilyShareValidationError} a recipient is not allowed
 */
export const updateFamilyShares = async (
  ctx: TenantContext,
  actor: FamilyShareActor,
  familyId: string,
  requested: Array<{ companyId: string; discountPct: number }>,
): Promise<FamilyShares> => {
  // Cross-tenant list, read first: the reach check, validation and write below must share ONE
  // tenant transaction, so a share revoked mid-request can't be written to afterwards.
  const everyTarget = await withSystemTransaction(getDb(), (tx) => listFamilyShareTargets(tx, ctx.effectiveCompanyId))

  await withTenantDb(ctx, async (tx) => {
    const detail = await getProductFamilyDetail(tx, familyId)
    if (!detail || !(await isFamilySharedWith(tx, familyId, ctx.effectiveCompanyId))) {
      throw new FamilyShareNotFoundError('Product family not found')
    }
    // Locked: a connection can't be removed while these shares are written (removing waits for this transaction).
    const connected = await lockConnectedCompanyIds(
      tx,
      ctx.effectiveCompanyId,
      requested.map((share) => share.companyId),
    )
    const allowed = new Set(
      everyTarget
        .filter((c) => c.id !== detail.family.supplierCompanyId && connected.has(c.id))
        .map((c) => c.id),
    )
    for (const share of requested) {
      if (!allowed.has(share.companyId)) {
        throw new FamilyShareValidationError(`Company '${share.companyId}' cannot receive this family`)
      }
    }
    // A draft can't be shared with anyone new; an unpublished family can still have its existing shares trimmed.
    if (!detail.family.isPublished) {
      const current = new Set((await listOutgoingFamilyShares(tx, familyId, ctx.effectiveCompanyId)).map((s) => s.companyId))
      if (requested.some((share) => !current.has(share.companyId))) {
        throw new FamilyShareValidationError('Publish the family before sharing it with new companies')
      }
    }
    await replaceOutgoingFamilyShares(tx, familyId, ctx.effectiveCompanyId, requested)
    await recordAuditEvent(
      tx,
      {
        actorType: 'user',
        actorUserId: actor.actorUserId,
        actorCompanyId: actor.actorCompanyId,
        requestId: actor.requestId,
      },
      ctx.effectiveCompanyId,
      {
        action: 'product_family.share.update',
        resourceType: 'product_family',
        resourceId: familyId,
        metadata: { shares: requested },
      },
    )
  })
  return getFamilyShares(ctx, familyId)
}
