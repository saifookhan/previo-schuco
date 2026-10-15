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

export interface CompanyDetails {
  name: string
  vatNumber: string
  address: string
  city: string
  country: string
  phone: string
  email: string
  website: string
}

export const DEMO_USERS: User[] = DEMO_USER_SEEDS.map((user, index) => ({
  id: String(index + 1),
  name: user.name,
  email: user.email,
  roleId: user.roleId,
  status: user.status,
}))

export const DEMO_COMPANY: CompanyDetails = {
  name: 'Schüco Partner Italia S.r.l.',
  vatNumber: 'IT12345678901',
  address: 'Via dell\'Innovazione 42',
  city: 'Milano, 20100',
  country: 'Italy',
  phone: '+39 02 1234 5678',
  email: 'info@schuco-partner-demo.it',
  website: 'https://www.schueco.com',
}
