import type { NextResponse } from 'next/server'

import { proxyJson } from '@/lib/api/proxy-patch'

/** The catalog €/pz of the builder's lines. */
export const POST = (request: Request): Promise<NextResponse> => proxyJson(request, '/api/sales-quotes/price-lines', 'POST')
