import type { NextResponse } from 'next/server'

import { proxyEmpty } from '@/lib/api/proxy-patch'

/** The signed-in user's newest notifications and unread count. */
export const GET = (): Promise<NextResponse> => proxyEmpty('/api/notifications', 'GET')
