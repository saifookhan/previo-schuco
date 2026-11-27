import type { NextResponse } from 'next/server'

import { proxyPatch } from '@/lib/api/proxy-patch'

/** Renames a variant. */
export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<NextResponse> => {
  const { id, versionId } = await params
  return proxyPatch(request, `/api/sales-quotes/${id}/versions/${versionId}/label`)
}
