import { Suspense } from 'react'

import { LoginForm } from '@/components/login-form'
import { isDevLoginAllowed } from '@/lib/auth/config'

/**
 * Login page — email+password, with an optional dev seed-user shortcut.
 * Dynamic so the shortcut follows the runtime flag, not the value inlined
 * when the client bundle was built.
 */
export const dynamic = 'force-dynamic'

const LoginPage = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <Suspense>
      <LoginForm devLoginEnabled={isDevLoginAllowed()} />
    </Suspense>
  </div>
)

export default LoginPage
