/** Canonical PREVIO role IDs. */
export type DemoRoleId = 'super-admin' | 'company-admin' | 'super-user' | 'user'

/** Company key used in seed data. */
export type DemoCompanyKey = 'schuco' | 'suppli' | 'technometal' | 'fabbrikka'

/** Business unit key used in seed data. */
export type DemoBusinessUnitKey =
  | 'schuco_hq'
  | 'suppli_hq'
  | 'technometal_a'
  | 'technometal_b'
  | 'fabbrikka_hq'

/** Demo user seed row — single source of truth for local dev and UI fixtures. */
export interface DemoUserSeed {
  cognitoSub: string
  email: string
  name: string
  roleId: DemoRoleId
  companyKey: DemoCompanyKey
  status: 'active' | 'inactive'
  /** Business units the user can see. */
  businessUnits: DemoBusinessUnitKey[]
  /** Subset of businessUnits where the user has edit rights. */
  editBusinessUnits: DemoBusinessUnitKey[]
}

/**
 * Canonical PREVIO demo users — one per role plus inactive company-admin example.
 */
export const DEMO_USER_SEEDS: DemoUserSeed[] = [
  {
    cognitoSub: 'seed-super-admin',
    email: 'admin@schuco-demo.it',
    name: 'Anna Bianchi',
    roleId: 'super-admin',
    companyKey: 'schuco',
    status: 'active',
    businessUnits: ['schuco_hq'],
    editBusinessUnits: ['schuco_hq'],
  },
  {
    cognitoSub: 'seed-schuco-company-admin',
    email: 'elena.costa@schuco-demo.it',
    name: 'Elena Costa',
    roleId: 'company-admin',
    companyKey: 'schuco',
    status: 'inactive',
    businessUnits: ['schuco_hq'],
    editBusinessUnits: ['schuco_hq'],
  },
  {
    cognitoSub: 'seed-suppli-company-admin',
    email: 'admin@suppli-demo.it',
    name: 'Paolo Suppli',
    roleId: 'company-admin',
    companyKey: 'suppli',
    status: 'active',
    businessUnits: ['suppli_hq'],
    editBusinessUnits: ['suppli_hq'],
  },
  {
    cognitoSub: 'seed-company-admin',
    email: 'admin@technometal-demo.it',
    name: 'Luca Verdi',
    roleId: 'company-admin',
    companyKey: 'technometal',
    status: 'active',
    businessUnits: ['technometal_a', 'technometal_b'],
    editBusinessUnits: ['technometal_a', 'technometal_b'],
  },
  {
    cognitoSub: 'seed-super-user',
    email: 'manager@technometal-demo.it',
    name: 'Giulia Neri',
    roleId: 'super-user',
    companyKey: 'technometal',
    status: 'active',
    businessUnits: ['technometal_a', 'technometal_b'],
    editBusinessUnits: ['technometal_b'],
  },
  {
    cognitoSub: 'seed-user',
    email: 'sales@technometal-demo.it',
    name: 'Marco Rossi',
    roleId: 'user',
    companyKey: 'technometal',
    status: 'active',
    businessUnits: ['technometal_a'],
    editBusinessUnits: ['technometal_a'],
  },
  {
    cognitoSub: 'seed-fabbrikka-company-admin',
    email: 'admin@fabbrikka-demo.it',
    name: 'Sara Fabbrikka',
    roleId: 'company-admin',
    companyKey: 'fabbrikka',
    status: 'active',
    businessUnits: ['fabbrikka_hq'],
    editBusinessUnits: ['fabbrikka_hq'],
  },
]

/** Active demo users for dev login dropdown. */
export const ACTIVE_DEMO_USER_EMAILS = DEMO_USER_SEEDS.filter(
  (user) => user.status === 'active',
).map((user) => user.email)
