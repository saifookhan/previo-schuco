'use client'

import { Building2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Link } from '@/i18n/navigation'

/** Requests a password-reset email. Always shows the same "check your email" confirmation — never reveals whether the address exists. */
export const ForgotPasswordForm = () => {
  const t = useTranslations('forgotPassword')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } finally {
      setLoading(false)
      setSent(true)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10">
          <Building2 className="h-6 w-6 text-brand" />
        </div>
        <CardTitle>{t('title')}</CardTitle>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="text-center text-sm text-slate-600">{t('checkEmail')}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('emailLabel')}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('sending') : t('sendResetLink')}
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-brand hover:underline">
            {t('backToLogin')}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
