import type { MeResponse } from '@schuco/contracts'
import { redirect } from 'next/navigation'
import { cache, type ReactNode } from 'react'

import { fetchFromApiResult } from '@/lib/api/server-client'

import { canAccess, PAGE_ACCESS, type GuardedPath } from './page-access'

/** The signed-in user, fetched once per request however many layouts and pages ask. */
export const getMe = cache(() => fetchFromApiResult<MeResponse>('/api/me'))

/**
 * Server-side page guard: a signed-in user without access is sent to the
 * dashboard (as the admin layout does), instead of seeing the page fail to
 * load its data. If /api/me itself fails, the page renders and shows its
 * own load error.
 */
export const requirePageAccess = async (path: GuardedPath): Promise<void> => {
  const result = await getMe()
  if (result.status === 'unauthenticated') {
    // A cookie is there (middleware let us in) but it isn't a usable session:
    // clear it on the way to /login, or /login would bounce straight back here.
    redirect('/api/auth/logout')
  }
  if (result.status === 'ok' && !canAccess(result.data.user, PAGE_ACCESS[path])) {
    redirect('/app/dashboard')
  }
}

/** A section layout that only renders for users the section's PAGE_ACCESS rule lets in. */
export const guardedLayout = (path: GuardedPath) => {
  const GuardedLayout = async ({ children }: { children: ReactNode }) => {
    await requirePageAccess(path)
    return children
  }
  return GuardedLayout
}
