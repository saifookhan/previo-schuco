import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'

import { defaultLocale, locales } from '@/i18n/config'
import { authConfig } from '@/lib/auth/config'
import { isDocumentNavigation } from '@/lib/http/document-navigation'

/** Read the session claims without verifying. The API verifies the token; this only chooses which header to forward. */
const readSessionClaims = (token: string): { isDevLogin: boolean; sub?: string } | null => {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(padded)) as { isDevLogin?: unknown; sub?: unknown }
    return {
      isDevLogin: json.isDevLogin === true,
      sub: typeof json.sub === 'string' ? json.sub : undefined,
    }
  } catch {
    return null
  }
}

const sessionCookieName = 'previo_session'

/**
 * Signed-in non-admins hitting an admin URL from an API client get 403 JSON.
 * A browser navigation still falls through to the admin layout, which redirects
 * to /app/dashboard — the shell depends on that.
 */
const adminApiForbidden = async (request: NextRequest): Promise<NextResponse | null> => {
  const { pathname } = request.nextUrl
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/')
  if (!isAdmin || isDocumentNavigation(request)) return null

  const token = request.cookies.get(sessionCookieName)?.value
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  const claims = readSessionClaims(token)
  if (claims?.isDevLogin && claims.sub) {
    // The API drops this header unless ALLOW_DEV_LOGIN=true, so a dev-login
    // cookie cannot pass the role check after the shortcut is turned off.
    headers['X-Dev-User-Sub'] = claims.sub
  } else {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const response = await fetch(`${authConfig.apiUrl}/api/me`, { headers, cache: 'no-store' })
    if (!response.ok) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const data = (await response.json()) as { user?: { role?: { id?: string } } }
    if (data.user?.role?.id !== 'super-admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'API unreachable' }, { status: 503 })
  }

  return null
}

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'never',
})

const protectedPrefixes = ['/app', '/admin']

/**
 * Protect /app routes; delegate i18n to next-intl middleware.
 */
export default async function middleware(request: NextRequest) {
  const forbidden = await adminApiForbidden(request)
  if (forbidden) return forbidden

  const { pathname } = request.nextUrl
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )

  if (isProtected) {
    const session = request.cookies.get(sessionCookieName)
    if (!session?.value) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  if (pathname === '/login') {
    const session = request.cookies.get(sessionCookieName)
    if (session?.value) {
      const dashboardUrl = request.nextUrl.clone()
      dashboardUrl.pathname = '/app/dashboard'
      dashboardUrl.search = ''
      return NextResponse.redirect(dashboardUrl)
    }
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: ['/', '/((?!api|_next|_vercel|.*\\..*).*)'],
}
