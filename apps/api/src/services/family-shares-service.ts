import {
  getIncomingShareItems,
  getProductFamilyDetail,
  isFamilySharedWith,
  listFamilyShareTargets,
  listOutgoingFamilyShares,
  listPreviousVersionShareItems,
  lockConnectedCompanyIds,
  replaceOutgoingFamilyShares,
  withSystemTransaction,
  type FamilyShareItem,
  type FamilyShareItemValues,
  type ProductFamilyDetail,
} from '@schuco/db'
import type { FamilyShareItemDto, FamilyShareableItem, FamilySharesResponse } from '@schuco/contracts'

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

const optional = (value: string | null): number | null => (value == null ? null : Number(value))

/**
 * Every line and option (sub-characteristic) of the family, with the family's own values — the
 * Excel's — as the default a share starts from; an option without its own gets no discount, no
 * markup and no hours.
 */
const shareableItems = (detail: ProductFamilyDetail): FamilyShareableItem[] => {
  const nameOf = new Map(detail.characteristics.map((c) => [c.id, c.name]))
  return [
    ...[...detail.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((line) => ({
        kind: 'line' as const,
        id: line.id,
        name: line.name,
        characteristicName: null,
        discountPct: Number(line.discountPct),
        markupPct: Number(line.markupPct),
        installationHours: Number(line.installationHoursPerUnit),
      })),
    ...detail.characteristics
      .filter((option) => option.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((option) => ({
        kind: 'option' as const,
        id: option.id,
        name: option.name,
        characteristicName: nameOf.get(option.parentId!) ?? '',
        discountPct: optional(option.discountPct) ?? 0,
        markupPct: optional(option.markupPct) ?? 100,
        installationHours: optional(option.installationHoursPerUnit) ?? 0,
      })),
  ]
}

const valuesOf = ({ discountPct, markupPct, installationHours }: FamilyShareItemValues): FamilyShareItemValues => ({
  discountPct,
  markupPct,
  installationHours,
})

/** The share's value for every item of the family: what was saved, or the item's default. */
const completeItems = (items: FamilyShareableItem[], saved: Map<string, FamilyShareItemValues>): FamilyShareItemDto[] =>
  items.map((item) => ({ kind: item.kind, id: item.id, ...valuesOf(saved.get(item.id) ?? item) }))

const byItemId = (items: FamilyShareItem[]): Map<string, FamilyShareItemValues> =>
  new Map(items.map((item) => [(item.productLineId ?? item.characteristicId)!, valuesOf(item)]))

export type FamilyShares = FamilySharesResponse

/**
 * What the share of this family with the caller's company gives it, by product line or option id;
 * null when the family is the company's own or wasn't shared with it.
 */
export const getFamilyShareItems = (
  ctx: TenantContext,
  familyId: string,
): Promise<Record<string, FamilyShareItemValues> | null> =>
  withTenantDb(ctx, async (tx) => {
    const items = await getIncomingShareItems(tx, ctx.effectiveCompanyId, familyId)
    return items && Object.fromEntries(items)
  })

/**
 * The shares the caller's company made of this family (with every line's and option's values),
 * the family's lines and options with their defaults, what companies got on other versions of the
 * family, and the companies it could add.
 * @throws {FamilyShareNotFoundError} unknown family, or one the caller's company cannot reach
 */
export const getFamilyShares = async (ctx: TenantContext, familyId: string): Promise<FamilyShares> => {
  const { ownerCompanyId, ...shares } = await withTenantDb(ctx, async (tx) => {
    const detail = await getProductFamilyDetail(tx, familyId)
    if (!detail || !(await isFamilySharedWith(tx, familyId, ctx.effectiveCompanyId))) {
      throw new FamilyShareNotFoundError('Product family not found')
    }
    const items = shareableItems(detail)
    const shares = await listOutgoingFamilyShares(tx, familyId, ctx.effectiveCompanyId)
    const shared = new Set(shares.map((share) => share.companyId))
    // A line matches by name; an option by its characteristic's name and its own.
    const keyOf = (characteristicName: string | null, name: string) =>
      characteristicName == null ? `line:${name}` : `option:${characteristicName}\u0000${name}`
    const byKey = new Map(items.map((item) => [keyOf(item.characteristicName, item.name), item]))
    const previous = [...(await listPreviousVersionShareItems(tx, familyId, ctx.effectiveCompanyId))]
      .filter(([companyId]) => !shared.has(companyId))
      .map(([companyId, named]) => ({
        companyId,
        items: named.flatMap((old) => {
          const match = byKey.get(old.lineName != null ? keyOf(null, old.lineName) : keyOf(old.characteristicName, old.optionName!))
          return match ? [{ kind: match.kind, id: match.id, ...valuesOf(old) }] : []
        }),
      }))
    return {
      ownerCompanyId: detail.family.supplierCompanyId,
      items,
      shares: shares.map((share) => ({
        companyId: share.companyId,
        companyName: share.companyName,
        items: completeItems(items, byItemId(share.items)),
      })),
      previous,
    }
  })
  // Listed across tenants, so system-scoped — names only.
  const targets = await withSystemTransaction(getDb(), (tx) => listFamilyShareTargets(tx, ctx.effectiveCompanyId))
  return { ...shares, targets: targets.filter((company) => company.id !== ownerCompanyId) }
}

/**
 * Replaces the set of companies the caller's company shares this family with, each with
 * the discount, markup and installation hours it gets per line and option (a line or option
 * left out gets its default). Only published families can be shared with new
 * companies. The sharer is the owner or any company that was itself shared the
 * family (onward sharing). Recipients must be connected with the sharer (Partners page).
 * @throws {FamilyShareNotFoundError} unknown family, or one the caller's company cannot reach
 * @throws {FamilyShareValidationError} a recipient is not allowed
 */
export const updateFamilyShares = async (
  ctx: TenantContext,
  actor: FamilyShareActor,
  familyId: string,
  requested: Array<{ companyId: string; items: FamilyShareItemDto[] }>,
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
    const items = shareableItems(detail)
    const kindOf = new Map(items.map((item) => [item.id, item.kind]))
    for (const share of requested) {
      const unknown = share.items.find((item) => kindOf.get(item.id) !== item.kind)
      if (unknown) {
        throw new FamilyShareValidationError(`'${unknown.id}' is not a ${unknown.kind === 'line' ? 'product line' : 'option'} of this family`)
      }
    }
    const shares = requested.map((share) => ({
      companyId: share.companyId,
      items: completeItems(items, new Map(share.items.map((item) => [item.id, valuesOf(item)]))),
    }))
    await replaceOutgoingFamilyShares(
      tx,
      familyId,
      ctx.effectiveCompanyId,
      shares.map((share) => ({
        companyId: share.companyId,
        items: share.items.map(({ kind, id, ...values }) => ({
          productLineId: kind === 'line' ? id : null,
          characteristicId: kind === 'option' ? id : null,
          ...values,
        })),
      })),
    )
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
        metadata: { shares },
      },
    )
  })
  return getFamilyShares(ctx, familyId)
}
