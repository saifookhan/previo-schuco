import { z } from 'zod'

import { businessUnitScopeSchema } from './auth'
import { roleIdSchema } from './common'

/** Tenant-scoped user row for company-admin user management. */
export const userDtoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  status: z.enum(['invited', 'invite_failed', 'active', 'inactive']),
  role: z.object({
    id: roleIdSchema,
    name: z.string(),
  }),
  businessUnits: z.array(businessUnitScopeSchema),
})

export type UserDto = z.infer<typeof userDtoSchema>

/** Cross-tenant user row for super-admin platform management. */
export const adminUserDtoSchema = userDtoSchema.extend({
  cognitoSub: z.string().nullable(),
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

/**
 * POST /api/users (company-admin, self-scoped) and
 * POST /api/admin/invites (super-admin, cross-tenant) request body.
 * `companyId` is omitted by the caller for the self-scoped route — the
 * route forces it to the caller's own company; it's required for the
 * cross-tenant admin route. See ADR 0004.
 */
export const inviteUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  roleId: roleIdSchema,
  companyId: z.string().uuid().optional(),
  businessUnitIds: z.array(z.string().uuid()).optional(),
})

export type InviteUserRequest = z.infer<typeof inviteUserRequestSchema>

/** POST /api/users and POST /api/admin/invites response. */
export const inviteUserResponseSchema = z.object({
  user: userDtoSchema,
})

export type InviteUserResponse = z.infer<typeof inviteUserResponseSchema>
