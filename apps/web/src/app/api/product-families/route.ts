import type { NextResponse } from 'next/server'

import { proxyGetToApi } from '@/lib/api/server-client'

/** JSON list of product families visible to the caller. The HTML list at /app/product-families loads the same API path server-side. */
export const GET = (request: Request): Promise<NextResponse> => proxyGetToApi(request, '/api/product-families')
