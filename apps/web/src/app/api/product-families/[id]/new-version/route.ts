import type { NextResponse } from 'next/server'

import { proxyFormDataToApi } from '@/lib/api/server-client'

/** Saves an updated Excel upload as the next version of this family (see /api/product-families/import). */
export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyFormDataToApi(request, `/api/product-families/${encodeURIComponent(id)}/new-version`)
}
