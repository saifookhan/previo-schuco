'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { RoleId } from '@/types/settings'
import type { CompanyCapabilities, Permission } from '@schuco/contracts'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  /** Primary (highest-ranked) role. */
  role: {
    id: RoleId
    name: string
    description: string
  }
  /** Every role the user holds, highest rank first; includes the primary. */
  roles: Array<{ id: RoleId; name: string; description: string }>
  /** Effective permissions computed by the API from the saved role matrix and the company's capabilities. */
  permissions: Permission[]
  company: {
    id: string
    name: string
    capabilities: CompanyCapabilities
  }
  businessUnits: Array<{ id: string; name: string; canEdit: boolean }>
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
  hasRole: (...roles: RoleId[]) => boolean
  /** Whether the user's roles grant `permission` AND their company's capabilities unlock it. */
  can: (permission: Permission) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Provide authenticated user context to client components.
 */
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  // Set for the whole sign-out so an in-flight session read cannot paint the user back in.
  const signingOut = useRef(false)

  const refresh = useCallback(async () => {
    if (signingOut.current) return
    setLoading(true)
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' })
      if (signingOut.current) return
      if (!response.ok) {
        setUser(null)
        return
      }
      const data = (await response.json()) as { user: AuthUser | null }
      if (signingOut.current) return
      setUser(data.user)
    } catch {
      if (!signingOut.current) setUser(null)
    } finally {
      if (!signingOut.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    signingOut.current = true
    setUser(null)
    try {
      await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' })
      // The logout response's Set-Cookie is applied before this fetch resolves.
      // A follow-up session read proves the jar no longer has the cookie, so the
      // navigation to /login cannot race ahead of the clear and bounce back to
      // /app/dashboard on a still-live session (middleware redirects /login → dashboard
      // whenever the cookie is present).
      const session = await fetch('/api/auth/session', { cache: 'no-store' })
      // Gone only on a 401 without the `session` echo: a 401 with it (the API refused
      // the user) or a 503 (API down) is answered while the cookie is still there.
      const body = (await session.json().catch(() => ({}))) as { session?: unknown }
      if (session.status === 401 && !body.session) {
        window.location.replace('/login')
        return
      }
    } catch {
      // Fall through to the page-load sign-out below.
    }
    // Still signed in (or the request failed): sign out with a full page load
    // instead, whose response clears the cookie and redirects to /login.
    window.location.replace('/api/auth/logout')
  }, [])

  const hasRole = useCallback(
    (...roles: RoleId[]) => (user ? user.roles.some((r) => roles.includes(r.id)) : false),
    [user],
  )

  const can = useCallback(
    (permission: Permission) => (user ? (user.permissions ?? []).includes(permission) : false),
    [user],
  )

  const value = useMemo(
    () => ({ user, loading, refresh, signOut, hasRole, can }),
    [user, loading, refresh, signOut, hasRole, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Access current authenticated user and RBAC helpers.
 */
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
