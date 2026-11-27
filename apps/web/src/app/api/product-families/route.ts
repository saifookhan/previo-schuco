import type { NextResponse } from 'next/server'

import { proxyJson } from '@/lib/api/proxy-patch'
import { proxyGetToApi } from '@/lib/api/server-client'

/** JSON list of product families visible to the caller. The HTML list at /app/product-families loads the same API path server-side. */
export const GET = (request: Request): Promise<NextResponse> => proxyGetToApi(request, '/api/product-families')

/** Creates an empty product family from the fields confirmed in the create dialog. */
export const POST = (request: Request): Promise<NextResponse> => proxyJson(request, '/api/product-families', 'POST')
