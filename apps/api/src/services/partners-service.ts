import {
  computePermissions,
  partnerSidesOf,
  type NotificationType,
  type PartnerStatus,
  type PartnersResponse,
} from '@schuco/contracts'
import {
  acceptConnection,
  capabilitiesOf,
  companies,
  deleteConnection,
  deleteSharesBetween,
  getCompanyConnectionForUpdate,
  insertConnectionRequest,
  insertNotifications,
  listCompanyConnections,
  listPartnerDirectory,
  listUsers,
  withSystemTransaction,
  type CompanyConnectionRow,
  type DbLike,
} from '@schuco/db'
import { inArray } from 'drizzle-orm'

import { getDb } from '../lib/db'
import { sendPartnerRequestEmail } from '../lib/email'
import { logger } from '../lib/logger'
import type { TenantContext } from '../lib/tenant-db'
import { appPublicUrl } from '../lib/urls'
import { recordAuditEvent } from './audit-service'
import { getEffectiveRolePermissions } from './role-permissions-service'

/** The other company doesn't exist, is inactive, is the caller's own, or isn't a possible client or supplier of it. */
export class PartnerNotFoundError extends Error {}

/** The connection isn't in a state that allows this action (e.g. accepting a request nobody sent). */
export class PartnerConflictError extends Error {}

export interface PartnerActor {
  actorUserId: string
  actorCompanyId: string
  requestId?: string | null
}

const statusFor = (row: CompanyConnectionRow | null | undefined, companyId: string): PartnerStatus => {
  if (!row) {
    return 'none'
  }
  if (row.status === 'accepted') {
    return 'connected'
  }
  return row.requesterCompanyId === companyId ? 'sent' : 'received'
}

/**
 * The Partners page: every active company the caller's company could connect
 * with, split into clients and suppliers, with where each connection stands.
 * Other companies' rows are read across tenants (system transaction), and only
 * their name, address and branch names leave it.
 */
export const getPartners = async (ctx: TenantContext): Promise<PartnersResponse> =>
  withSystemTransaction(getDb(), async (tx) => {
    const directory = await listPartnerDirectory(tx)
    const mine = directory.find((c) => c.id === ctx.effectiveCompanyId)
    if (!mine) {
      return { tabs: { clients: false, suppliers: false }, companies: [] }
    }
    const connections = new Map(
      (await listCompanyConnections(tx, mine.id)).map((row) => [
        row.requesterCompanyId === mine.id ? row.addresseeCompanyId : row.requesterCompanyId,
        row,
      ]),
    )
    const result: PartnersResponse['companies'] = []
    for (const other of directory) {
      if (other.id === mine.id) {
        continue
      }
      const sides = partnerSidesOf(mine.capabilities, other.capabilities)
      const status = statusFor(connections.get(other.id), mine.id)
      // A company that no longer fits either tab still shows while a connection or request with it exists, so it can be removed.
      if (!sides.isClient && !sides.isSupplier && status === 'none') {
        continue
      }
      result.push({ id: other.id, name: other.name, address: other.address, branches: other.branches, ...sides, status })
    }
    const anyone = partnerSidesOf(mine.capabilities, { platform: true, manufacturer: true, supplier: true, client: true })
    return { tabs: { clients: anyone.isClient, suppliers: anyone.isSupplier }, companies: result }
  })

/**
 * Both companies. The other one must exist and, unless `requireActive` is false, be active
 * (an inactive company's request can still be refused and its connection removed).
 */
const loadPair = async (tx: DbLike, companyId: string, otherCompanyId: string, { requireActive = true } = {}) => {
  if (companyId === otherCompanyId) {
    throw new PartnerNotFoundError('A company cannot connect with itself')
  }
  const rows = await tx.select().from(companies).where(inArray(companies.id, [companyId, otherCompanyId]))
  const mine = rows.find((row) => row.id === companyId)
  const other = rows.find((row) => row.id === otherCompanyId)
  if (!mine || !other || (requireActive && !other.isActive)) {
    throw new PartnerNotFoundError('Company not found')
  }
  return { mine, other }
}

/** Whether the two can be connected: one can share families with the other. */
const canConnect = (mine: typeof companies.$inferSelect, other: typeof companies.$inferSelect): boolean => {
  const sides = partnerSidesOf(capabilitiesOf(mine), capabilitiesOf(other))
  return sides.isClient || sides.isSupplier
}

/** Who at `companyId` hears about partner changes: its active users allowed to manage partners. */
const partnerManagersOf = async (tx: DbLike, companyId: string) => {
  const matrix = await getEffectiveRolePermissions()
  return (await listUsers(tx, companyId, 'active')).filter((user) =>
    computePermissions(
      user.roles.map((role) => role.id),
      user.company.capabilities,
      matrix,
    ).includes('partners.manage'),
  )
}

const notify = async (
  tx: DbLike,
  recipientCompanyId: string,
  type: NotificationType,
  about: { id: string; name: string },
  connectionId: string | null = null,
) => {
  const recipients = await partnerManagersOf(tx, recipientCompanyId)
  await insertNotifications(
    tx,
    recipients.map((user) => ({
      userId: user.id,
      companyId: recipientCompanyId,
      type,
      otherCompanyId: about.id,
      otherCompanyName: about.name,
      connectionId,
    })),
  )
  return recipients
}

const audit = (
  tx: DbLike,
  ctx: TenantContext,
  actor: PartnerActor,
  action: string,
  other: { id: string; name: string },
  metadata: Record<string, unknown> = {},
) =>
  recordAuditEvent(
    tx,
    { actorType: 'user', actorUserId: actor.actorUserId, actorCompanyId: actor.actorCompanyId, requestId: actor.requestId },
    ctx.effectiveCompanyId,
    { action, resourceType: 'company', resourceId: other.id, metadata: { companyName: other.name, ...metadata } },
  )

/** Emails are sent after the change is saved; a failed email doesn't undo it. */
const emailRequest = (recipients: Array<{ email: string }>, fromCompanyName: string) => {
  for (const recipient of recipients) {
    sendPartnerRequestEmail({ to: recipient.email, fromCompanyName, partnersUrl: `${appPublicUrl()}/app/partners` }).catch(
      (error: unknown) => logger.error({ err: error, to: recipient.email }, 'partner request email failed'),
    )
  }
}

/**
 * Asks `otherCompanyId` to connect. If it had already asked the caller's
 * company, this accepts that request instead. Nothing changes when the two are
 * already connected or the request is already waiting.
 * Cross-tenant on purpose (system transaction): it notifies the other company's
 * users. The checks here are what keep it to the caller's own connections.
 * @throws {PartnerNotFoundError} unknown/inactive company, or one that can't be a client or supplier of the caller's
 */
export const requestConnection = async (
  ctx: TenantContext,
  actor: PartnerActor,
  otherCompanyId: string,
): Promise<PartnerStatus> => {
  let emailTo: Array<{ email: string }> = []
  let fromName = ''
  const status = await withSystemTransaction(getDb(), async (tx) => {
    const { mine, other } = await loadPair(tx, ctx.effectiveCompanyId, otherCompanyId)
    const existing = await getCompanyConnectionForUpdate(tx, mine.id, other.id)
    if (existing) {
      if (statusFor(existing, mine.id) === 'received') {
        await acceptPending(tx, ctx, actor, existing, mine, other)
        return 'connected' as const
      }
      return statusFor(existing, mine.id)
    }
    if (!canConnect(mine, other)) {
      throw new PartnerNotFoundError('This company cannot be a client or supplier of yours')
    }
    const connectionId = await insertConnectionRequest(tx, {
      requesterCompanyId: mine.id,
      addresseeCompanyId: other.id,
      userId: actor.actorUserId || null,
    })
    if (!connectionId) {
      // Another request for this pair was saved at the same moment: answer with where things stand now.
      const now = statusFor(await getCompanyConnectionForUpdate(tx, mine.id, other.id), mine.id)
      if (now === 'received') {
        throw new PartnerConflictError('The other company has just sent a request — reload and accept it')
      }
      return now
    }
    emailTo = await notify(tx, other.id, 'partner.request_received', mine, connectionId)
    fromName = mine.name
    await audit(tx, ctx, actor, 'partner.request', other)
    return 'sent' as const
  })
  emailRequest(emailTo, fromName)
  return status
}

const acceptPending = async (
  tx: DbLike,
  ctx: TenantContext,
  actor: PartnerActor,
  row: CompanyConnectionRow,
  mine: typeof companies.$inferSelect,
  other: typeof companies.$inferSelect,
) => {
  // The companies' kinds may have changed since the request was sent.
  if (!canConnect(mine, other)) {
    throw new PartnerConflictError('This company can no longer be a client or supplier of yours')
  }
  await acceptConnection(tx, row.id, actor.actorUserId || null)
  await notify(tx, other.id, 'partner.request_accepted', mine)
  await audit(tx, ctx, actor, 'partner.accept', other)
}

/**
 * Accepts the request `otherCompanyId` sent the caller's company.
 * @throws {PartnerNotFoundError} unknown or inactive company
 * @throws {PartnerConflictError} no request from that company is waiting, or the two can no longer connect
 */
export const acceptConnectionRequest = (ctx: TenantContext, actor: PartnerActor, otherCompanyId: string): Promise<PartnerStatus> =>
  withSystemTransaction(getDb(), async (tx) => {
    const { mine, other } = await loadPair(tx, ctx.effectiveCompanyId, otherCompanyId)
    const existing = await getCompanyConnectionForUpdate(tx, mine.id, other.id)
    if (!existing || statusFor(existing, mine.id) !== 'received') {
      throw new PartnerConflictError('There is no request from this company to accept')
    }
    await acceptPending(tx, ctx, actor, existing, mine, other)
    return 'connected' as const
  })

/**
 * Refuses the request `otherCompanyId` sent. It is told, and may ask again later.
 * @throws {PartnerNotFoundError} unknown company
 * @throws {PartnerConflictError} no request from that company is waiting
 */
export const rejectConnectionRequest = (ctx: TenantContext, actor: PartnerActor, otherCompanyId: string): Promise<PartnerStatus> =>
  withSystemTransaction(getDb(), async (tx) => {
    const { mine, other } = await loadPair(tx, ctx.effectiveCompanyId, otherCompanyId, { requireActive: false })
    const existing = await getCompanyConnectionForUpdate(tx, mine.id, other.id)
    if (!existing || statusFor(existing, mine.id) !== 'received') {
      throw new PartnerConflictError('There is no request from this company to refuse')
    }
    await deleteConnection(tx, existing.id)
    await notify(tx, other.id, 'partner.request_rejected', mine)
    await audit(tx, ctx, actor, 'partner.reject', other)
    return 'none' as const
  })

/**
 * Withdraws the caller's own waiting request, or removes a connection. Removing
 * also stops every family share between the two companies, in both directions;
 * the other company is told. Nothing changes when there is no connection.
 * @throws {PartnerNotFoundError} unknown company
 * @throws {PartnerConflictError} the other company's request is waiting (refuse it instead)
 */
export const removeConnection = (ctx: TenantContext, actor: PartnerActor, otherCompanyId: string): Promise<PartnerStatus> =>
  withSystemTransaction(getDb(), async (tx) => {
    const { mine, other } = await loadPair(tx, ctx.effectiveCompanyId, otherCompanyId, { requireActive: false })
    const existing = await getCompanyConnectionForUpdate(tx, mine.id, other.id)
    if (!existing) {
      return 'none' as const
    }
    const status = statusFor(existing, mine.id)
    if (status === 'received') {
      throw new PartnerConflictError('This company is waiting for your answer — refuse the request instead')
    }
    await deleteConnection(tx, existing.id)
    if (status === 'sent') {
      await audit(tx, ctx, actor, 'partner.withdraw', other)
      return 'none' as const
    }
    const removedShares = await deleteSharesBetween(tx, mine.id, other.id)
    await notify(tx, other.id, 'partner.connection_removed', mine)
    await audit(tx, ctx, actor, 'partner.remove', other, { removedShares })
    return 'none' as const
  })
