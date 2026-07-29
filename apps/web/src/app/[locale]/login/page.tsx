import { LoginForm } from '@/components/login-form'

/**
 * Demo login page — any credentials redirect to the dashboard.
 */
const LoginPage = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <LoginForm />
  </div>
)

export default LoginPage
