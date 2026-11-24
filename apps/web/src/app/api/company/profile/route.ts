import type { NextResponse } from 'next/server'

import { proxyEmpty, proxyJson } from '@/lib/api/proxy-patch'

/** The company's profile, branches and sales contacts. */
export const GET = (): Promise<NextResponse> => proxyEmpty('/api/company/profile', 'GET')

export const PUT = (request: Request): Promise<NextResponse> => proxyJson(request, '/api/company/profile', 'PUT')
