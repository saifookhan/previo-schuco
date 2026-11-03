import type { NotificationType, NotificationsResponse } from '@schuco/contracts'
import { countUnreadNotifications, listUserNotifications, markAllNotificationsRead } from '@schuco/db'

import { withTenantDb, type TenantContext } from '../lib/tenant-db'

/** How many notifications the bell shows. */
const NOTIFICATIONS_SHOWN = 30

/** The user's newest notifications and their unread count. */
export const getNotifications = (ctx: TenantContext, userId: string): Promise<NotificationsResponse> =>
  withTenantDb(ctx, async (tx) => {
    const rows = await listUserNotifications(tx, userId, NOTIFICATIONS_SHOWN)
    return {
      notifications: rows.map((row) => ({
        id: row.id,
        type: row.type as NotificationType,
        otherCompanyId: row.otherCompanyId,
        otherCompanyName: row.otherCompanyName,
        actionable: row.actionable,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      unreadCount: await countUnreadNotifications(tx, userId),
    }
  })

/** Marks every notification of the user read. */
export const markNotificationsRead = (ctx: TenantContext, userId: string): Promise<void> =>
  withTenantDb(ctx, (tx) => markAllNotificationsRead(tx, userId))
