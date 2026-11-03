import { notificationsResponseSchema } from '@schuco/contracts'
import { Hono } from 'hono'

import type { AuthVariables } from '../middleware/auth'
import { requireAuth } from '../middleware/auth'
import { getNotifications, markNotificationsRead } from '../services/notifications-service'

/** The signed-in user's own notifications (the bell). */
export const notifications = new Hono<{ Variables: AuthVariables }>()

notifications.get('/', requireAuth, async (c) => {
  const result = await getNotifications(
    { effectiveCompanyId: c.get('effectiveCompanyId'), isSuperAdmin: c.get('isSuperAdmin') },
    c.get('actorUserId'),
  )
  return c.json(notificationsResponseSchema.parse(result))
})

/** Mark all of them read. */
notifications.post('/read', requireAuth, async (c) => {
  await markNotificationsRead(
    { effectiveCompanyId: c.get('effectiveCompanyId'), isSuperAdmin: c.get('isSuperAdmin') },
    c.get('actorUserId'),
  )
  return c.json({ ok: true })
})
