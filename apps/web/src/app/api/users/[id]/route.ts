import type { NextResponse } from 'next/server'

import { proxyPatch } from '@/lib/api/proxy-patch'

/** Proxies an edit of a company user (name, roles, active/inactive). */
export const PATCH = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyPatch(request, `/api/users/${encodeURIComponent(id)}`)
}
