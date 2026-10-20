import type { NextResponse } from 'next/server'

import { proxyGetToApi } from '@/lib/api/server-client'

/** The product family's change history (owning company and super-admin only). Paged with `?cursor=`. */
export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyGetToApi(request, `/api/product-families/${encodeURIComponent(id)}/history`)
}
