import type { NextResponse } from 'next/server'

import { proxyGetToApi } from '@/lib/api/server-client'

/** What changed between two versions of a family (the version tree on the family page). */
export const GET = async (
  request: Request,
  { params }: { params: Promise<{ id: string; otherId: string }> },
): Promise<NextResponse> => {
  const { id, otherId } = await params
  return proxyGetToApi(request, `/api/product-families/${encodeURIComponent(id)}/compare/${encodeURIComponent(otherId)}`)
}
