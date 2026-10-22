import type { NextResponse } from 'next/server'

import { proxyFormDataToApi } from '@/lib/api/server-client'

/**
 * Saves an Excel upload as a new product family, with the fields confirmed in
 * the upload dialog. A route handler (not a server action) because the browser
 * sends multipart form data and only the server can attach the session.
 */
export const POST = (request: Request): Promise<NextResponse> =>
  proxyFormDataToApi(request, '/api/product-families/import')
