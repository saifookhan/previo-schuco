import type { NextResponse } from 'next/server'

import { proxyFormDataToApi } from '@/lib/api/server-client'

/** Proxies an image upload for a product family. */
export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyFormDataToApi(request, `/api/product-families/${encodeURIComponent(id)}/images`)
}
