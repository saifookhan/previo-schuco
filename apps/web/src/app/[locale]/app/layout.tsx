import { AuthProvider } from '@/hooks/use-auth'
import { AppShell } from '@/components/app-shell'

/**
 * Layout wrapper for authenticated app routes with sidebar navigation.
 */
const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <AppShell>{children}</AppShell>
  </AuthProvider>
)

export default AppLayout
