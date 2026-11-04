import { NextResponse } from 'next/server'

/**
 * Unmatched `/api/*` paths must not fall through to `app/[locale]/...`.
 * A static `api` segment with no route handler loses to `[locale]="api"`,
 * so `/api/admin/users` used to render the admin HTML page (and a signed-in
 * non-admin got a 307 to `/app/dashboard`). Specific route handlers win
 * over this catch-all.
 */
const notFound = (): NextResponse => NextResponse.json({ error: 'Not found' }, { status: 404 })

export const GET = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
