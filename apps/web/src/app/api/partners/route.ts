import type { NextResponse } from 'next/server'

import { proxyEmpty } from '@/lib/api/proxy-patch'

/** The Partners page's companies and connection statuses. */
export const GET = (): Promise<NextResponse> => proxyEmpty('/api/partners', 'GET')
