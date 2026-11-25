import type { NextResponse } from 'next/server'

import { proxyEmpty, proxyJson } from '@/lib/api/proxy-patch'

/** The company's saved texts. */
export const GET = (): Promise<NextResponse> => proxyEmpty('/api/company/text-templates', 'GET')

export const POST = (request: Request): Promise<NextResponse> => proxyJson(request, '/api/company/text-templates', 'POST')
