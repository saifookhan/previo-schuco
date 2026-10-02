import { Suspense } from 'react'

import { LoginForm } from '@/components/login-form'

/**
 * Login page — email+password, with an optional dev seed-user shortcut.
 */
const LoginPage = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    {/* TEMPORARY — remove after confirming auto-deploy works, see
        .github/workflows/deploy.yml */}
    <p className="fixed top-2 right-2 rounded bg-amber-200 px-2 py-1 text-xs text-amber-900">
      deploy-test: 2026-10-02
    </p>
    <Suspense>
      <LoginForm />
    </Suspense>
  </div>
)

export default LoginPage
