import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import type { DbLike } from '../client'
import { notifications } from '../schema'

export interface InsertNotificationInput {
  userId: string
  companyId: string
  type: string
  otherCompanyId: string | null
  otherCompanyName: string | null
  connectionId?: string | null
}

export interface NotificationRow {
  id: string
  type: string
  otherCompanyId: string | null
  otherCompanyName: string | null
  /** The connection request this notification is about still waits for the user's company. */
  actionable: boolean
  readAt: Date | null
  createdAt: Date
}

export const insertNotifications = async (db: DbLike, rows: InsertNotificationInput[]): Promise<void> => {
  if (rows.length) {
    await db.insert(notifications).values(rows)
  }
}

/** The user's newest notifications. */
export const listUserNotifications = (db: DbLike, userId: string, limit: number): Promise<NotificationRow[]> =>
  db
    .select({
      id: notifications.id,
      type: notifications.type,
      otherCompanyId: notifications.otherCompanyId,
      otherCompanyName: notifications.otherCompanyName,
      actionable: sql<boolean>`EXISTS (
        SELECT 1 FROM company_connections cc
        WHERE cc.id = ${notifications.connectionId}
          AND cc.status = 'pending'
          AND cc.addressee_company_id = ${notifications.companyId}
      )`,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)

export const countUnreadNotifications = async (db: DbLike, userId: string): Promise<number> => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
  return row?.count ?? 0
}

export const markAllNotificationsRead = async (db: DbLike, userId: string): Promise<void> => {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
}
