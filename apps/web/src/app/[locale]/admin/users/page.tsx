import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchFromApi } from '@/lib/api/server-client'
import type { AdminUsersListResponse } from '@schuco/contracts'

/**
 * Super-admin users table listing all platform users across companies.
 */
const AdminUsersPage = async () => {
  const data = await fetchFromApi<AdminUsersListResponse>('/api/admin/users')
  const users = data?.users ?? []

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">All users</h1>
        <p className="mt-1 text-sm text-slate-400">
          Cross-tenant user directory — super-admin only
        </p>
      </div>

      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-white">{users.length} users</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-400">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Company</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Cognito sub</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-6 py-4 font-medium text-white">{user.name ?? '—'}</td>
                  <td className="px-6 py-4 text-slate-300">{user.email}</td>
                  <td className="px-6 py-4 text-slate-300">
                    <div>{user.company.name}</div>
                    <div className="text-xs capitalize text-slate-500">{user.company.type}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge>{user.role.name}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={user.status === 'active' ? 'success' : 'muted'}>
                      {user.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{user.cognitoSub}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">No users found.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export default AdminUsersPage
