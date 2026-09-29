import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'

/** Requests a password-reset email (proxies to apps/api). Always returns ok — never reveals whether the email exists. */
export const POST = async (request: Request): Promise<NextResponse> => {
  const body = await request.json().catch(() => null)

  try {
    await fetch(`${authConfig.apiUrl}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // Deliberately still reports success to the caller — see the module doc.
  }

  return NextResponse.json({ ok: true })
}
