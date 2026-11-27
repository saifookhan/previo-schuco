import type { NextResponse } from 'next/server'

import { proxyJson } from '@/lib/api/proxy-patch'

/** Marks or clears a favorite on one quote variant. */
export const POST = async (
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<NextResponse> => {
  const { id, versionId } = await params
  return proxyJson(request, `/api/sales-quotes/${id}/versions/${versionId}/favorite`, 'POST')
}
