import type { NextResponse } from 'next/server'

import { proxyJson } from '@/lib/api/proxy-patch'

/** Adds a branch. */
export const POST = (request: Request): Promise<NextResponse> => proxyJson(request, '/api/company/business-units', 'POST')
