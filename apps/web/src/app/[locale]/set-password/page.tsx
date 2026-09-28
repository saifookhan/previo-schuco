import { Suspense } from 'react'

import { SetPasswordForm } from '@/components/set-password-form'

/** Accept-invite / password-reset page — reads ?token= from the emailed link. */
const SetPasswordPage = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  </div>
)

export default SetPasswordPage
