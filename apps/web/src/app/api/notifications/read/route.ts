import type { NextResponse } from 'next/server'

import { proxyEmpty } from '@/lib/api/proxy-patch'

/** Marks all of the user's notifications read. */
export const POST = (): Promise<NextResponse> => proxyEmpty('/api/notifications/read', 'POST')
