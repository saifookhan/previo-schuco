import Link from 'next/link'
import { ArrowRight, Building2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Public marketing home page.
 */
const HomePage = () => (
  <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
    <header className="border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-brand" />
          <span className="text-lg font-bold text-slate-900">Schuco</span>
        </div>
        <Link href="/login">
          <Button variant="outline">Sign in</Button>
        </Link>
      </div>
    </header>

    <main className="mx-auto max-w-5xl px-6 py-24">
      <div className="max-w-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand">
          Quote &amp; Project Platform
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
          Configure, quote, and manage Schüco projects
        </h1>
        <p className="mt-6 text-lg text-slate-600">
          Demo platform for window and door quotes — built with Next.js, Hono,
          and SQLite. Manage invoices, users, roles, and company settings in one place.
        </p>
        <div className="mt-10 flex gap-4">
          <Link href="/login">
            <Button className="gap-2">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/app/dashboard">
            <Button variant="outline">View demo dashboard</Button>
          </Link>
        </div>
      </div>
    </main>
  </div>
)

export default HomePage
