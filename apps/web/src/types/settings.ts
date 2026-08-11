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

export const DEMO_ROLES: Role[] = [
  {
    id: 'super-admin',
    name: 'Super Admin',
    description: 'PREVIO / Schuco platform operators with cross-tenant access',
  },
  {
    id: 'company-admin',
    name: 'Company Admin',
    description: 'Manages company settings, users, and product visibility',
  },
  {
    id: 'super-user',
    name: 'Super User (Sales Manager)',
    description: 'Sales coordinator — team offers within scoped business units',
  },
  {
    id: 'user',
    name: 'User (Sales Associate)',
    description: 'Standard sales staff — own offers only',
  },
]

export const DEMO_USERS: User[] = DEMO_USER_SEEDS.map((user, index) => ({
  id: String(index + 1),
  name: user.name,
  email: user.email,
  roleId: user.roleId,
  status: user.status,
}))

export const ACCESS_MODULES = [
  'Dashboard',
  'Invoices',
  'Users',
  'Roles',
  'Company',
  'Reports',
] as const

export type AccessModule = (typeof ACCESS_MODULES)[number]

export const DEFAULT_ACCESS_MATRIX: Record<RoleId, Record<AccessModule, boolean>> = {
  'super-admin': {
    Dashboard: true,
    Invoices: true,
    Users: true,
    Roles: true,
    Company: true,
    Reports: true,
  },
  'company-admin': {
    Dashboard: true,
    Invoices: true,
    Users: true,
    Roles: false,
    Company: true,
    Reports: true,
  },
  'super-user': {
    Dashboard: true,
    Invoices: true,
    Users: false,
    Roles: false,
    Company: false,
    Reports: true,
  },
  user: {
    Dashboard: true,
    Invoices: true,
    Users: false,
    Roles: false,
    Company: false,
    Reports: false,
  },
}

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
