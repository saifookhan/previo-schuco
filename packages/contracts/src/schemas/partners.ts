import { z } from 'zod'

import type { CompanyCapabilities } from './companies'

/**
 * Where a company stands with mine: not connected, I asked and wait (`sent`),
 * they asked and wait for me (`received`), or connected.
 */
export const partnerStatusSchema = z.enum(['none', 'sent', 'received', 'connected'])

export type PartnerStatus = z.infer<typeof partnerStatusSchema>

/** One company on the Partners page. */
export const partnerDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  /** Address of the company's first branch, if it has one. */
  address: z.string().nullable(),
  /** Branch names, for search. */
  branches: z.array(z.string()),
  /** Listed under "Clients": it can receive my families. */
  isClient: z.boolean(),
  /** Listed under "Suppliers": it can share its families with me. */
  isSupplier: z.boolean(),
  status: partnerStatusSchema,
})

export type PartnerDto = z.infer<typeof partnerDtoSchema>

/** GET /api/partners response. */
export const partnersResponseSchema = z.object({
  /** Which tabs the caller's company has. */
  tabs: z.object({ clients: z.boolean(), suppliers: z.boolean() }),
  companies: z.array(partnerDtoSchema),
})

export type PartnersResponse = z.infer<typeof partnersResponseSchema>

/**
 * Which side of a supply relationship a company can be on. A company shares
 * families if it makes or sells them (manufacturer, supplier, or the platform's
 * own catalog); it receives them if it is a supplier or a client. A supplier is
 * on both sides: it gets families from manufacturers and passes them to clients.
 */
export const canShareFamilies = (c: CompanyCapabilities): boolean => c.manufacturer || c.supplier || c.platform
export const canReceiveFamilies = (c: CompanyCapabilities): boolean => c.supplier || c.client

/**
 * How `other` appears on `mine`'s Partners page: under "Clients" when mine can
 * share with it, under "Suppliers" when it can share with mine. Neither means
 * the two companies can't connect. Symmetric: `other` is my client exactly when
 * I am its supplier.
 */
export const partnerSidesOf = (
  mine: CompanyCapabilities,
  other: CompanyCapabilities,
): { isClient: boolean; isSupplier: boolean } => ({
  isClient: canShareFamilies(mine) && canReceiveFamilies(other),
  isSupplier: canReceiveFamilies(mine) && canShareFamilies(other),
})

/** Notification types and what they mean. */
export const NOTIFICATION_TYPES = [
  /** Another company asked to connect with mine. */
  'partner.request_received',
  /** A company accepted my company's request. */
  'partner.request_accepted',
  /** A company refused my company's request. */
  'partner.request_rejected',
  /** A company removed its connection with mine. */
  'partner.connection_removed',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const notificationDtoSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  otherCompanyId: z.string().uuid().nullable(),
  otherCompanyName: z.string().nullable(),
  /** A connection request still waiting for my company: the notification shows Accept / Refuse. */
  actionable: z.boolean(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
})

export type NotificationDto = z.infer<typeof notificationDtoSchema>

/** GET /api/notifications response: the newest notifications and how many are unread. */
export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationDtoSchema),
  unreadCount: z.number().int().min(0),
})

export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>
