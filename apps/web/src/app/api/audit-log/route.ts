import type { NextResponse } from 'next/server'

import { proxyGetToApi } from '@/lib/api/server-client'

/** One page of the audit log (company admin: own company; super-admin: all). Filters pass through as the query string. */
export const GET = (request: Request): Promise<NextResponse> => proxyGetToApi(request, '/api/audit-log')
