import { z } from 'zod'

import { businessUnitScopeSchema } from './auth'
import { roleIdSchema } from './common'

/** Tenant-scoped user row for company-admin user management. */
export const userDtoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  status: z.enum(['invited', 'active', 'inactive']),
  role: z.object({
    id: roleIdSchema,
    name: z.string(),
  }),
  businessUnits: z.array(businessUnitScopeSchema),
})

export type UserDto = z.infer<typeof userDtoSchema>

/** Cross-tenant user row for super-admin platform management. */
export const adminUserDtoSchema = userDtoSchema.extend({
  cognitoSub: z.string(),
  company: z.object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.enum(['platform', 'supplier', 'client']),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type AdminUserDto = z.infer<typeof adminUserDtoSchema>

/** GET /api/users response. */
export const usersListResponseSchema = z.object({
  users: z.array(userDtoSchema),
})

export type UsersListResponse = z.infer<typeof usersListResponseSchema>

/** GET /api/admin/users response. */
export const adminUsersListResponseSchema = z.object({
  users: z.array(adminUserDtoSchema),
})

export type AdminUsersListResponse = z.infer<typeof adminUsersListResponseSchema>
