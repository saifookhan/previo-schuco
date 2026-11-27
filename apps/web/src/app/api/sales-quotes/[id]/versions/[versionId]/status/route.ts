import type { NextResponse } from 'next/server'

import { proxyJson } from '@/lib/api/proxy-patch'

/** Marks a variant draft, invoiced, or accepted. */
export const POST = async (
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<NextResponse> => {
  const { id, versionId } = await params
  return proxyJson(request, `/api/sales-quotes/${id}/versions/${versionId}/status`, 'POST')
}
