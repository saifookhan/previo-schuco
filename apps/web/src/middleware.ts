import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'

import { defaultLocale, locales } from '@/i18n/config'
import { authConfig } from '@/lib/auth/config'
import { isDocumentNavigation } from '@/lib/http/document-navigation'

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

  // The API verifies the token (and refuses a demo-login one once ALLOW_DEV_LOGIN is off).
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` }

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

const protectedPrefixes = ['/app', '/admin', '/print']

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
  matcher: ['/', '/((?!api|health|_next|_vercel|.*\\..*).*)'],
}
