import { AuthProvider } from '@/hooks/use-auth'
import { AppShell } from '@/components/app-shell'
import { NotificationsProvider } from '@/components/notifications'

/**
 * Layout wrapper for authenticated app routes with sidebar navigation.
 */
const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <NotificationsProvider>
      <AppShell>{children}</AppShell>
    </NotificationsProvider>
  </AuthProvider>
)

export default AppLayout
