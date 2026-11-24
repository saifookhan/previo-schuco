import { DEMO_USER_SEEDS } from '@/lib/demo-users'

export type RoleId = 'super-admin' | 'company-admin' | 'super-user' | 'user' | string

export interface Role {
  id: RoleId
  name: string
  description: string
}

export interface User {
  id: string
  name: string
  email: string
  roleId: RoleId
  status: 'active' | 'inactive'
}

export const DEMO_USERS: User[] = DEMO_USER_SEEDS.map((user, index) => ({
  id: String(index + 1),
  name: user.name,
  email: user.email,
  roleId: user.roleId,
  status: user.status,
}))
