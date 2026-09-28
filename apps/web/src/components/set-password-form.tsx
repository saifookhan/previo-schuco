'use client'

import { Building2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Accept-invite / password-reset form — same form for both, the token itself says which one it is (see apps/api's auth-service.ts). */
export const SetPasswordForm = () => {
  const t = useTranslations('setPassword')
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!token) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center text-sm text-red-600">{t('missingToken')}</CardContent>
      </Card>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 10) {
      setError(t('errorTooShort'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('errorMismatch'))
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? t('errorFailed'))
        return
      }
      router.push('/app/dashboard')
      router.refresh()
    } catch {
      setError(t('errorUnreachable'))
    } finally {
      setLoading(false)
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">{t('newPasswordLabel')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('confirmPasswordLabel')}</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={10}
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('saving') : t('setPassword')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
