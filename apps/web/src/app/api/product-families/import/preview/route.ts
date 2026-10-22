import type { NextResponse } from 'next/server'

import { proxyFormDataToApi } from '@/lib/api/server-client'

/** Checks an Excel upload in memory (nothing is saved) so the upload dialog can show what it holds. */
export const POST = (request: Request): Promise<NextResponse> =>
  proxyFormDataToApi(request, '/api/product-families/import/preview')
