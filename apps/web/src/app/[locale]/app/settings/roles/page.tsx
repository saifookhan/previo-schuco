'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEMO_ROLES, type Role } from '@/types/settings'

/**
 * Demo roles management with add/remove capability.
 */
const RolesPage = () => {
  const [roles, setRoles] = useState<Role[]>(DEMO_ROLES)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const addRole = () => {
    if (!newName.trim()) return
    setRoles((prev) => [
      ...prev,
      {
        id: newName.toLowerCase().replace(/\s+/g, '-'),
        name: newName.trim(),
        description: newDescription.trim() || 'Custom role',
      },
    ])
    setNewName('')
    setNewDescription('')
  }

  const removeRole = (id: string) => {
    if (['super-admin', 'admin', 'sales-manager'].includes(id)) return
    setRoles((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Roles</h1>
        <p className="mt-1 text-sm text-slate-500">Define roles and permission groups</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>{role.name}</CardTitle>
                <p className="mt-1 text-sm text-slate-500">{role.description}</p>
              </div>
              {!['super-admin', 'admin', 'sales-manager'].includes(role.id) && (
                <button
                  onClick={() => removeRole(role.id)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove ${role.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </CardHeader>
            <CardContent>
              <p className="font-mono text-xs text-slate-400">{role.id}</p>
            </CardContent>
          </Card>
        ))}

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Add role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="role-name">Role name</Label>
              <Input
                id="role-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Project Manager"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-desc">Description</Label>
              <Input
                id="role-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <Button onClick={addRole} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Add role
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default RolesPage
