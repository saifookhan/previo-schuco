'use client'

import { ACTIVE_DEMO_USER_EMAILS } from '@/lib/demo-users'
import { Building2 } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isCognitoConfigured } from '@/lib/auth/config'

const DEV_USERS = ACTIVE_DEMO_USER_EMAILS

/**
 * Login form — Cognito hosted UI or dev login when Cognito is not configured.
 */
export const LoginForm = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const devMode = searchParams.get('dev') === '1' || !isCognitoConfigured()
  const error = searchParams.get('error')
  const [email, setEmail] = useState('admin@schuco-demo.it')
  const [loading, setLoading] = useState(false)

  const handleCognitoLogin = () => {
    window.location.href = '/api/auth/login'
  }

  const handleDevSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!response.ok) {
        throw new Error('Dev login failed')
      }
      router.push('/app/dashboard')
      router.refresh()
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
        <CardTitle>Sign in to PREVIO</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          {devMode ? 'Local dev login (seed users)' : 'Sign in with your company account'}
        </p>
        {error ? (
          <p className="mt-2 text-sm text-red-600">Authentication failed: {error}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {devMode ? (
          <form onSubmit={handleDevSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                list="dev-users"
              />
              <datalist id="dev-users">
                {DEV_USERS.map((userEmail) => (
                  <option key={userEmail} value={userEmail} />
                ))}
              </datalist>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Dev sign in'}
            </Button>
          </form>
        ) : (
          <Button type="button" className="w-full" onClick={handleCognitoLogin}>
            Continue with Cognito
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
