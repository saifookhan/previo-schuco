export type RoleId = 'super-admin' | 'admin' | 'sales-manager' | string

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
    description: 'Full platform access including user and role management',
  },
  {
    id: 'admin',
    name: 'Admin',
    description: 'Manage quotes, users, and company settings',
  },
  {
    id: 'sales-manager',
    name: 'Sales Manager',
    description: 'Create and edit quotes and invoices',
  },
]

export const DEMO_USERS: User[] = [
  {
    id: '1',
    name: 'Anna Bianchi',
    email: 'anna.bianchi@schuco-demo.it',
    roleId: 'super-admin',
    status: 'active',
  },
  {
    id: '2',
    name: 'Luca Verdi',
    email: 'luca.verdi@schuco-demo.it',
    roleId: 'admin',
    status: 'active',
  },
  {
    id: '3',
    name: 'Giulia Neri',
    email: 'giulia.neri@schuco-demo.it',
    roleId: 'sales-manager',
    status: 'active',
  },
  {
    id: '4',
    name: 'Marco Rossi',
    email: 'marco.rossi@schuco-demo.it',
    roleId: 'sales-manager',
    status: 'active',
  },
  {
    id: '5',
    name: 'Elena Costa',
    email: 'elena.costa@schuco-demo.it',
    roleId: 'admin',
    status: 'inactive',
  },
]

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
  admin: {
    Dashboard: true,
    Invoices: true,
    Users: true,
    Roles: false,
    Company: true,
    Reports: true,
  },
  'sales-manager': {
    Dashboard: true,
    Invoices: true,
    Users: false,
    Roles: false,
    Company: false,
    Reports: true,
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
