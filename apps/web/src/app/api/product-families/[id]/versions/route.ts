import type { NextResponse } from 'next/server'

import { proxyGetToApi } from '@/lib/api/server-client'

/** The family's versions; `?steps=true` adds the change counts the version timeline shows. */
export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyGetToApi(request, `/api/product-families/${encodeURIComponent(id)}/versions`)
}
