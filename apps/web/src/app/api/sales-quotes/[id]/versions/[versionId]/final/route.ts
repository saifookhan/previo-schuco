import type { NextResponse } from 'next/server'

import { proxyEmpty } from '@/lib/api/proxy-patch'

/** Marks a variant as the quote's final offer. */
export const POST = async (
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<NextResponse> => {
  const { id, versionId } = await params
  return proxyEmpty(`/api/sales-quotes/${id}/versions/${versionId}/final`, 'POST')
}
