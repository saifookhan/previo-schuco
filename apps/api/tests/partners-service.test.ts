process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  auditLog,
  companies,
  createDb,
  notifications,
  productFamilies,
  productFamilyShares,
  roles,
  users,
  withSystemTransaction,
  type Db,
} from '@schuco/db'

import { getDb } from '../src/lib/db'
import { FamilyShareValidationError, updateFamilyShares } from '../src/services/family-shares-service'
import { getNotifications, markNotificationsRead } from '../src/services/notifications-service'
import {
  acceptConnectionRequest,
  getPartners,
  PartnerConflictError,
  PartnerNotFoundError,
  rejectConnectionRequest,
  removeConnection,
  requestConnection,
} from '../src/services/partners-service'

/** Service-layer test: Partners page connections, their notifications, and sharing limited to connected companies. */

let db: Db
let manufacturer: string
let supplier: string
let client: string
let otherClient: string
let inactive: string
const admins: Record<string, string> = {}
let plainUser: string
const createdCompanyIds: string[] = []
const ctxOf = (companyId: string) => ({ effectiveCompanyId: companyId, isSuperAdmin: false })
const actorOf = (companyId: string) => ({ actorUserId: admins[companyId], actorCompanyId: companyId })

const notificationsOf = async (userId: string) =>
  withSystemTransaction(db, (tx) =>
    tx.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(notifications.createdAt),
  )
const statusSeenBy = async (companyId: string, otherId: string) =>
  (await getPartners(ctxOf(companyId))).companies.find((c) => c.id === otherId)?.status

beforeAll(async () => {
  db = getDb()
  await withSystemTransaction(db, async (tx) => {
    await tx
      .insert(roles)
      .values([
        { id: 'company-admin', name: 'Company Admin', description: 'test role' },
        { id: 'user', name: 'User', description: 'test role' },
      ])
      .onConflictDoNothing({ target: roles.id })
    const make = async (values: Partial<typeof companies.$inferInsert> & { name: string; vatNumber: string }) => {
      const [row] = await tx.insert(companies).values(values).returning({ id: companies.id })
      createdCompanyIds.push(row.id)
      return row.id
    }
    manufacturer = await make({ isManufacturer: true, name: 'Partner Test Manufacturer', vatNumber: 'PART-MAN' })
    supplier = await make({ isSupplier: true, name: 'Partner Test Supplier', vatNumber: 'PART-SUP' })
    client = await make({ isClient: true, name: 'Partner Test Client', vatNumber: 'PART-CLI' })
    otherClient = await make({ isClient: true, name: 'Partner Test Other Client', vatNumber: 'PART-CLI2' })
    inactive = await make({ isClient: true, isActive: false, name: 'Partner Test Inactive', vatNumber: 'PART-OFF' })
    for (const companyId of [manufacturer, supplier, client, otherClient]) {
      const [user] = await tx
        .insert(users)
        .values({ email: `partner-admin-${companyId}@example.com`, companyId, roleId: 'company-admin', status: 'active' })
        .returning({ id: users.id })
      admins[companyId] = user.id
    }
    const [user] = await tx
      .insert(users)
      .values({ email: 'partner-plain-user@example.com', companyId: manufacturer, roleId: 'user', status: 'active' })
      .returning({ id: users.id })
    plainUser = user.id
  })
})

afterAll(async () => {
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  await createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
    .delete(auditLog)
    .where(inArray(auditLog.effectiveCompanyId, createdCompanyIds))
  await withSystemTransaction(db, async (tx) => {
    await tx.delete(productFamilies).where(inArray(productFamilies.supplierCompanyId, createdCompanyIds))
    await tx.delete(users).where(inArray(users.companyId, createdCompanyIds))
    await tx.delete(companies).where(inArray(companies.id, createdCompanyIds))
  })
})

describe('partners page', () => {
  it('shows a client only suppliers, a manufacturer only clients, and a supplier both', async () => {
    const forClient = await getPartners(ctxOf(client))
    expect(forClient.tabs).toEqual({ clients: false, suppliers: true })
    const clientSees = forClient.companies.filter((c) => createdCompanyIds.includes(c.id))
    expect(clientSees.map((c) => c.id).sort()).toEqual([manufacturer, supplier].sort())
    expect(clientSees.every((c) => c.isSupplier && !c.isClient && c.status === 'none')).toBe(true)

    const forManufacturer = await getPartners(ctxOf(manufacturer))
    expect(forManufacturer.tabs).toEqual({ clients: true, suppliers: false })
    const manufacturerSees = forManufacturer.companies.filter((c) => createdCompanyIds.includes(c.id))
    expect(manufacturerSees.map((c) => c.id).sort()).toEqual([supplier, client, otherClient].sort()) // not the inactive one

    const forSupplier = await getPartners(ctxOf(supplier))
    expect(forSupplier.tabs).toEqual({ clients: true, suppliers: true })
    const bySupplier = new Map(forSupplier.companies.map((c) => [c.id, c]))
    expect(bySupplier.get(manufacturer)).toMatchObject({ isSupplier: true, isClient: false })
    expect(bySupplier.get(client)).toMatchObject({ isSupplier: false, isClient: true })
  })

  it('refuses companies that cannot be a partner', async () => {
    await expect(requestConnection(ctxOf(client), actorOf(client), otherClient)).rejects.toThrow(PartnerNotFoundError)
    await expect(requestConnection(ctxOf(client), actorOf(client), client)).rejects.toThrow(PartnerNotFoundError)
    await expect(requestConnection(ctxOf(manufacturer), actorOf(manufacturer), inactive)).rejects.toThrow(PartnerNotFoundError)
    await expect(acceptConnectionRequest(ctxOf(client), actorOf(client), manufacturer)).rejects.toThrow(PartnerConflictError)
  })

  it('connects after a request is accepted, and tells the managers of each side', async () => {
    expect(await requestConnection(ctxOf(client), actorOf(client), manufacturer)).toBe('sent')
    expect(await requestConnection(ctxOf(client), actorOf(client), manufacturer)).toBe('sent') // asking again changes nothing
    expect(await statusSeenBy(client, manufacturer)).toBe('sent')
    expect(await statusSeenBy(manufacturer, client)).toBe('received')
    await expect(removeConnection(ctxOf(manufacturer), actorOf(manufacturer), client)).rejects.toThrow(PartnerConflictError)

    const received = await getNotifications(ctxOf(manufacturer), admins[manufacturer])
    expect(received.unreadCount).toBe(1)
    expect(received.notifications[0]).toMatchObject({
      type: 'partner.request_received',
      otherCompanyId: client,
      otherCompanyName: 'Partner Test Client',
      actionable: true,
    })
    expect(await notificationsOf(plainUser)).toEqual([]) // a plain user can't manage partners

    expect(await acceptConnectionRequest(ctxOf(manufacturer), actorOf(manufacturer), client)).toBe('connected')
    expect(await statusSeenBy(client, manufacturer)).toBe('connected')
    expect((await getNotifications(ctxOf(manufacturer), admins[manufacturer])).notifications[0].actionable).toBe(false)
    expect((await notificationsOf(admins[client])).map((n) => n.type)).toEqual(['partner.request_accepted'])

    const audit = await withSystemTransaction(db, (tx) =>
      tx.select().from(auditLog).where(inArray(auditLog.action, ['partner.request', 'partner.accept'])).orderBy(auditLog.createdAt),
    )
    expect(audit.filter((e) => e.resourceId === client || e.resourceId === manufacturer).map((e) => [e.action, e.effectiveCompanyId])).toEqual([
      ['partner.request', client],
      ['partner.accept', manufacturer],
    ])
  })

  it('removing a connection stops the family shares between the two, both ways', async () => {
    const [family] = await withSystemTransaction(db, (tx) =>
      tx
        .insert(productFamilies)
        .values({ supplierCompanyId: manufacturer, name: 'Partner Test Family', isPublished: true })
        .returning({ id: productFamilies.id }),
    )
    await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), family.id, [{ companyId: client, discountPct: 5 }])

    expect(await removeConnection(ctxOf(client), actorOf(client), manufacturer)).toBe('none')
    expect(await statusSeenBy(manufacturer, client)).toBe('none')
    const left = await withSystemTransaction(db, (tx) =>
      tx.select().from(productFamilyShares).where(eq(productFamilyShares.productFamilyId, family.id)),
    )
    expect(left).toEqual([])
    expect((await notificationsOf(admins[manufacturer])).map((n) => n.type)).toContain('partner.connection_removed')
    await expect(
      updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), family.id, [{ companyId: client, discountPct: 5 }]),
    ).rejects.toThrow(FamilyShareValidationError)
    expect(await removeConnection(ctxOf(client), actorOf(client), manufacturer)).toBe('none') // nothing left to remove
  })

  it('a refused request can be sent again; a withdrawn one leaves nothing to answer', async () => {
    expect(await requestConnection(ctxOf(supplier), actorOf(supplier), client)).toBe('sent')
    expect(await rejectConnectionRequest(ctxOf(client), actorOf(client), supplier)).toBe('none')
    expect((await notificationsOf(admins[supplier])).map((n) => n.type)).toEqual(['partner.request_rejected'])
    expect(await requestConnection(ctxOf(supplier), actorOf(supplier), client)).toBe('sent')
    // Only the new request's notification offers Accept / Refuse, not the refused one.
    const requests = (await getNotifications(ctxOf(client), admins[client])).notifications.filter(
      (n) => n.type === 'partner.request_received' && n.otherCompanyId === supplier,
    )
    expect(requests.map((n) => n.actionable)).toEqual([true, false])

    expect(await removeConnection(ctxOf(supplier), actorOf(supplier), client)).toBe('none') // withdrawn
    expect(await statusSeenBy(client, supplier)).toBe('none')
    const forClient = await getNotifications(ctxOf(client), admins[client])
    expect(forClient.notifications.filter((n) => n.type === 'partner.request_received').every((n) => !n.actionable)).toBe(true)
  })

  it('asking a company that already asked you accepts its request', async () => {
    expect(await requestConnection(ctxOf(supplier), actorOf(supplier), manufacturer)).toBe('sent')
    expect(await requestConnection(ctxOf(manufacturer), actorOf(manufacturer), supplier)).toBe('connected')
    expect(await statusSeenBy(supplier, manufacturer)).toBe('connected')
  })

  it('a request from a company deactivated since can still be refused, and kinds that no longer fit cannot connect', async () => {
    const setCompany = (id: string, values: Partial<typeof companies.$inferInsert>) =>
      withSystemTransaction(db, (tx) => tx.update(companies).set(values).where(eq(companies.id, id)))

    expect(await requestConnection(ctxOf(otherClient), actorOf(otherClient), manufacturer)).toBe('sent')
    await setCompany(otherClient, { isActive: false })
    try {
      await expect(acceptConnectionRequest(ctxOf(manufacturer), actorOf(manufacturer), otherClient)).rejects.toThrow(PartnerNotFoundError)
      expect(await rejectConnectionRequest(ctxOf(manufacturer), actorOf(manufacturer), otherClient)).toBe('none')
    } finally {
      await setCompany(otherClient, { isActive: true })
    }

    expect(await requestConnection(ctxOf(otherClient), actorOf(otherClient), manufacturer)).toBe('sent')
    await setCompany(manufacturer, { isManufacturer: false, isClient: true }) // now a client, like the asker
    try {
      await expect(acceptConnectionRequest(ctxOf(manufacturer), actorOf(manufacturer), otherClient)).rejects.toThrow(PartnerConflictError)
      // Still listed (under a tab), so the request can be answered.
      expect((await getPartners(ctxOf(manufacturer))).companies.find((c) => c.id === otherClient)?.status).toBe('received')
      expect(await rejectConnectionRequest(ctxOf(manufacturer), actorOf(manufacturer), otherClient)).toBe('none')
    } finally {
      await setCompany(manufacturer, { isManufacturer: true, isClient: false })
    }
  })

  it('marks notifications read only for that user', async () => {
    const before = await getNotifications(ctxOf(client), admins[client])
    expect(before.unreadCount).toBeGreaterThan(0)
    await markNotificationsRead(ctxOf(client), admins[client])
    expect((await getNotifications(ctxOf(client), admins[client])).unreadCount).toBe(0)
    expect((await getNotifications(ctxOf(manufacturer), admins[manufacturer])).unreadCount).toBeGreaterThan(0)
    // Another company's context can't read this user's notifications.
    expect((await getNotifications(ctxOf(otherClient), admins[client])).notifications).toEqual([])
    const unread = await withSystemTransaction(db, (tx) =>
      tx.select().from(notifications).where(and(eq(notifications.userId, admins[client]))),
    )
    expect(unread.every((n) => n.readAt)).toBe(true)
  })
})
