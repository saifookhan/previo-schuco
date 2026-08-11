import { Suspense } from 'react'

import { LoginForm } from '@/components/login-form'

/**
 * Login page with Cognito or dev authentication.
 */
const LoginPage = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <Suspense>
      <LoginForm />
    </Suspense>
  </div>
)

export default LoginPage
