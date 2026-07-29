import { FileText, TrendingUp, Users, Wallet } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/types/quote'

const stats = [
  {
    label: 'Open quotes',
    value: '12',
    icon: FileText,
    change: '+3 this week',
  },
  {
    label: 'Total pipeline',
    value: formatCurrency(35615.6, 'it'),
    icon: Wallet,
    change: 'IVA excluded',
  },
  {
    label: 'Active users',
    value: '4',
    icon: Users,
    change: '1 inactive',
  },
  {
    label: 'Conversion rate',
    value: '68%',
    icon: TrendingUp,
    change: '+5% vs last month',
  },
]

/**
 * Demo dashboard with summary stats and recent activity.
 */
const DashboardPage = () => (
  <div className="p-6 md:p-8">
    <div className="mb-8">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Overview of your Schuco quote platform</p>
    </div>

    <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, change }) => (
        <Card key={label}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
                <p className="mt-1 text-xs text-slate-400">{change}</p>
              </div>
              <div className="rounded-lg bg-brand/10 p-2">
                <Icon className="h-5 w-5 text-brand" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Recent quotes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { ref: 'PRV-2026-014', client: 'Sig. Marco Rossi', total: 35615.6 },
            { ref: 'PRV-2026-011', client: 'Studio Architetti Milano', total: 22100 },
            { ref: 'PRV-2026-009', client: 'Costruzioni Bianchi S.p.A.', total: 89400 },
          ].map((q) => (
            <div
              key={q.ref}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-900">{q.ref}</p>
                <p className="text-sm text-slate-500">{q.client}</p>
              </div>
              <p className="font-mono text-sm font-semibold text-brand">
                {formatCurrency(q.total, 'it')}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { label: 'Create new quote', href: '/app/invoice' },
            { label: 'Manage users', href: '/app/settings/users' },
            { label: 'Company settings', href: '/app/settings/company' },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="block rounded-lg border border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
            >
              {label}
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  </div>
)

export default DashboardPage
