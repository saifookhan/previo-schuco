'use client'

import { Bell, Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { NOTIFICATIONS_CHANGED_EVENT, usePartnerAction } from '@/hooks/use-partner-action'
import { useAuth } from '@/hooks/use-auth'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import type { NotificationDto, NotificationsResponse } from '@schuco/contracts'

/** How often the bell checks for new notifications. */
const POLL_MS = 60_000

interface NotificationsContextValue {
  data: NotificationsResponse | null
  failed: boolean
  markAllRead: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

/**
 * Loads the user's notifications once for the whole app shell (both bells and the
 * Partners panel read it): on mount, every minute, and whenever a connection
 * changes. Only for users who manage partners — nobody else gets notifications.
 */
export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const { can } = useAuth()
  const enabled = can('partners.manage')
  const [data, setData] = useState<NotificationsResponse | null>(null)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' })
      if (!response.ok) {
        setFailed(true)
        return
      }
      setData((await response.json()) as NotificationsResponse)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }
    void reload()
    const timer = setInterval(() => void reload(), POLL_MS)
    const onChange = () => void reload()
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange)
    return () => {
      clearInterval(timer)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange)
    }
  }, [enabled, reload])

  const markAllRead = useCallback(async () => {
    await fetch('/api/notifications/read', { method: 'POST' }).catch(() => null)
    await reload()
  }, [reload])

  const value = useMemo(() => ({ data, failed, markAllRead }), [data, failed, markAllRead])
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

const useNotifications = (): NotificationsContextValue => {
  const context = useContext(NotificationsContext)
  if (!context) {
    throw new Error('useNotifications needs a NotificationsProvider (the app shell has one)')
  }
  return context
}

const relativeTime = (iso: string, locale: string): string => {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit)
    }
  }
  return format.format(0, 'minute')
}

const NotificationItem = ({ notification }: { notification: NotificationDto }) => {
  const t = useTranslations('notifications')
  const locale = useLocale()
  const { run, busy } = usePartnerAction()
  const company = notification.otherCompanyName ?? t('unknownCompany')
  const unread = !notification.readAt
  return (
    <li className="flex gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
      <span className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', unread ? 'bg-brand' : 'bg-transparent')} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-700">
          <NotificationText type={notification.type} company={company} />
        </p>
        <p className="mt-0.5 text-xs text-slate-400">{relativeTime(notification.createdAt, locale)}</p>
        {notification.actionable && notification.otherCompanyId ? (
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy !== null}
              onClick={() => void run({ id: notification.otherCompanyId!, name: company }, 'accept')}
            >
              {busy === 'accept' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('accept')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => void run({ id: notification.otherCompanyId!, name: company }, 'reject')}
            >
              {t('reject')}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  )
}

/** The message, with the company name in bold. */
const NotificationText = ({ type, company }: { type: NotificationDto['type']; company: string }) => {
  const t = useTranslations('notifications')
  return t.rich(`types.${type.replace('.', '_')}`, {
    company,
    b: (chunks) => <span className="font-semibold text-slate-900">{chunks}</span>,
  })
}

const NotificationList = ({ notifications }: { notifications: NotificationDto[] }) => {
  const t = useTranslations('notifications')
  if (notifications.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-slate-400">{t('empty')}</p>
  }
  return (
    <ul>
      {notifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} />
      ))}
    </ul>
  )
}

/** Bell with the unread count; opening it shows the notifications and marks them read. */
export const NotificationBell = ({
  className,
  align = 'left',
}: {
  className?: string
  /** Which edge of the bell the panel lines up with. */
  align?: 'left' | 'right'
}) => {
  const t = useTranslations('notifications')
  const { can } = useAuth()
  const { data, failed, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  // The list as it was when opened, so items stay highlighted as unread while the panel is open.
  const [shown, setShown] = useState<NotificationDto[] | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Keep actions (Accept/Refuse) current while open, without un-highlighting what was unread.
  useEffect(() => {
    if (open && data) {
      setShown((prev) =>
        data.notifications.map((n) => {
          const before = prev?.find((p) => p.id === n.id)
          return before ? { ...n, readAt: before.readAt } : n
        }),
      )
    }
  }, [open, data])

  if (!can('partners.manage')) {
    return null
  }

  const unread = data?.unreadCount ?? 0
  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    setShown(data?.notifications ?? null)
    setOpen(true)
    if (unread > 0) {
      void markAllRead()
    }
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={toggle}
        className="relative rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label={unread > 0 ? `${t('open')} (${t('unread', { count: unread })})` : t('open')}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className={cn('absolute top-full z-[70] mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl', align === 'left' ? 'left-0' : 'right-0')}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">{t('title')}</p>
            <Link href="/app/partners" className="text-xs font-medium text-brand hover:underline" onClick={() => setOpen(false)}>
              {t('openPartners')}
            </Link>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {failed && !shown ? (
              <p className="px-4 py-6 text-center text-sm text-red-600">{t('loadFailed')}</p>
            ) : shown ? (
              <NotificationList notifications={shown} />
            ) : (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** The notifications panel beside the Partners list. */
export const NotificationsPanel = () => {
  const t = useTranslations('notifications')
  const { data, failed, markAllRead } = useNotifications()
  const unread = data?.unreadCount ?? 0
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">{t('title')}</p>
        {unread > 0 ? (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">{t('unread', { count: unread })}</span>
        ) : null}
      </div>
      <div className="max-h-[32rem] overflow-y-auto">
        {failed && !data ? (
          <p className="px-4 py-6 text-center text-sm text-red-600">{t('loadFailed')}</p>
        ) : data ? (
          <NotificationList notifications={data.notifications} />
        ) : (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        )}
      </div>
      {unread > 0 ? (
        <div className="border-t border-slate-100 px-4 py-2 text-right">
          <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => void markAllRead()}>
            {t('markAllRead')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
