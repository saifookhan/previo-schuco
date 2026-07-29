import { AppShell } from '@/components/app-shell'

/**
 * Layout wrapper for authenticated app routes with sidebar navigation.
 */
const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <AppShell>{children}</AppShell>
)

export default AppLayout
