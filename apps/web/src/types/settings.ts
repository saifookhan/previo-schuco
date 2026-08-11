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

export const DEMO_USERS: User[] = [
  {
    id: '1',
    name: 'Anna Bianchi',
    email: 'admin@schuco-demo.it',
    roleId: 'super-admin',
    status: 'active',
  },
  {
    id: '2',
    name: 'Luca Verdi',
    email: 'admin@technometal-demo.it',
    roleId: 'company-admin',
    status: 'active',
  },
  {
    id: '3',
    name: 'Giulia Neri',
    email: 'manager@technometal-demo.it',
    roleId: 'super-user',
    status: 'active',
  },
  {
    id: '4',
    name: 'Marco Rossi',
    email: 'sales@technometal-demo.it',
    roleId: 'user',
    status: 'active',
  },
  {
    id: '5',
    name: 'Elena Costa',
    email: 'elena.costa@schuco-demo.it',
    roleId: 'company-admin',
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
