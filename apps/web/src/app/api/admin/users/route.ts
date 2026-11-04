import type { NextResponse } from 'next/server'

import { proxyGetToApi } from '@/lib/api/server-client'

/**
 * Platform-wide user list for a super-admin. Without this route handler,
 * `/api/admin/users` falls through to the `[locale]` admin page (locale
 * "api") and returns HTML, or a 307 for a signed-in non-admin.
 */
export const GET = (request: Request): Promise<NextResponse> => proxyGetToApi(request, '/api/admin/users')
