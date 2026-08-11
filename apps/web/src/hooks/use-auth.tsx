'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import type { RoleId } from '@/types/settings'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: {
    id: RoleId
    name: string
    description: string
  }
  company: {
    id: string
    name: string
    type: 'platform' | 'supplier' | 'client'
  }
  businessUnits: Array<{ id: string; name: string; canEdit: boolean }>
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
  hasRole: (...roles: RoleId[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Provide authenticated user context to client components.
 */
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/auth/session')
      if (!response.ok) {
        setUser(null)
        return
      }
      const data = (await response.json()) as { user: AuthUser | null }
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    window.location.href = '/login'
  }, [])

  const hasRole = useCallback(
    (...roles: RoleId[]) => (user ? roles.includes(user.role.id) : false),
    [user],
  )

  const value = useMemo(
    () => ({ user, loading, refresh, signOut, hasRole }),
    [user, loading, refresh, signOut, hasRole],
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

/**
 * Minimum role rank for hierarchical checks.
 */
export const roleRank: Record<RoleId, number> = {
  'super-admin': 4,
  'company-admin': 3,
  'super-user': 2,
  user: 1,
}

/**
 * Check if user meets minimum role level.
 * @param userRole - Current user role
 * @param minimum - Minimum required role
 */
export const hasMinimumRole = (userRole: RoleId, minimum: RoleId): boolean =>
  roleRank[userRole] >= roleRank[minimum]
