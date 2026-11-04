import type { NextResponse } from 'next/server'

import { proxyGetToApi } from '@/lib/api/server-client'

/** Current user. Same payload as the API's GET /api/me; the browser session route is /api/auth/session. */
export const GET = (request: Request): Promise<NextResponse> => proxyGetToApi(request, '/api/me')
