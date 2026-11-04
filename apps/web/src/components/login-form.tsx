'use client'

import { ACTIVE_DEMO_USER_EMAILS } from '@/lib/demo-users'
import { Building2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Link } from '@/i18n/navigation'

const DEV_USERS = ACTIVE_DEMO_USER_EMAILS

/** Email+password login, with an optional dev-login shortcut for seeded demo users below it. */
export const LoginForm = ({ devLoginEnabled }: { devLoginEnabled: boolean }) => {
  const t = useTranslations('login')
  const router = useRouter()
  const devMode = devLoginEnabled

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [devEmail, setDevEmail] = useState('admin@schuco-demo.it')
  const [devLoading, setDevLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? t('errorLoginFailed'))
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

  const handleDevSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setDevLoading(true)
    try {
      const response = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: devEmail }),
      })
      if (!response.ok) {
        throw new Error('Dev login failed')
      }
      router.push('/app/dashboard')
      router.refresh()
    } finally {
      setDevLoading(false)
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
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t('emailLabel')}</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <Link href="/forgot-password" className="text-xs text-brand hover:underline">
                {t('forgotPassword')}
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('signingIn') : t('signIn')}
          </Button>
        </form>

        {devMode ? (
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{t('devSectionTitle')}</p>
            <form onSubmit={handleDevSubmit} className="space-y-2">
              <Input
                type="email"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                list="dev-users"
              />
              <datalist id="dev-users">
                {DEV_USERS.map((userEmail) => (
                  <option key={userEmail} value={userEmail} />
                ))}
              </datalist>
              <Button type="submit" variant="outline" className="w-full" disabled={devLoading}>
                {devLoading ? t('signingIn') : t('devSignIn')}
              </Button>
            </form>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
