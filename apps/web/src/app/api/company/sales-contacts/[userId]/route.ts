import type { NextResponse } from 'next/server'

import { proxyJson } from '@/lib/api/proxy-patch'

/** Sets the phone printed for a sales contact. */
export const PUT = async (request: Request, { params }: { params: Promise<{ userId: string }> }): Promise<NextResponse> =>
  proxyJson(request, `/api/company/sales-contacts/${(await params).userId}`, 'PUT')
