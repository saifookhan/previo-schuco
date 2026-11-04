import { redirect } from 'next/navigation'

import { AdminShell } from '@/components/admin-shell'
import { AuthProvider } from '@/hooks/use-auth'
import { fetchFromApi } from '@/lib/api/server-client'
import type { MeResponse } from '@schuco/contracts'

/**
 * Super-admin layout with server-side role guard and admin shell.
 */
const AdminLayout = async ({ children }: { children: React.ReactNode }) => {
  const me = await fetchFromApi<MeResponse>('/api/me')

  if (!me?.user) {
    redirect('/login?next=/admin/dashboard')
  }

  // Browser navigations land on the caller's own dashboard. API clients
  // (no HTML Accept, not a document navigation) are answered with 403 JSON
  // in middleware, before this layout runs.
  if (me.user.role.id !== 'super-admin') {
    redirect('/app/dashboard')
  }

  return (
    <AuthProvider>
      <AdminShell>{children}</AdminShell>
    </AuthProvider>
  )
}

export default AdminLayout
