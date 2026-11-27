import type { NextResponse } from 'next/server'

import { proxyEmpty } from '@/lib/api/proxy-patch'

/** Copies a saved variant to the next version, same alternative. */
export const POST = async (
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<NextResponse> => {
  const { id, versionId } = await params
  return proxyEmpty(`/api/sales-quotes/${id}/versions/${versionId}/promote`, 'POST')
}
