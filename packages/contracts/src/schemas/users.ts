import { z } from 'zod'

import { businessUnitScopeSchema } from './auth'
import { roleIdSchema } from './common'
import { companyCapabilitiesSchema } from './companies'

/** Tenant-scoped user row for company-admin user management. */
export const userDtoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  status: z.enum(['pending_approval', 'invited', 'invite_failed', 'active', 'inactive']),
  /** Primary (highest-ranked) role. */
  role: z.object({
    id: roleIdSchema,
    name: z.string(),
  }),
  /** Every role the user holds, highest rank first; includes the primary. */
  roles: z.array(z.object({ id: roleIdSchema, name: z.string() })),
  businessUnits: z.array(businessUnitScopeSchema),
})

export type UserDto = z.infer<typeof userDtoSchema>

/** Cross-tenant user row for super-admin platform management. */
export const adminUserDtoSchema = userDtoSchema.extend({
  cognitoSub: z.string().nullable(),
  company: z.object({
    id: z.string().uuid(),
    name: z.string(),
    capabilities: companyCapabilitiesSchema,
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
  roleIds: z
    .array(roleIdSchema)
    .min(1)
    .transform((ids) => [...new Set(ids)]),
  companyId: z.string().uuid().optional(),
  businessUnitIds: z.array(z.string().uuid()).optional(),
})

export type InviteUserRequest = z.infer<typeof inviteUserRequestSchema>

/** POST /api/users and POST /api/admin/invites response. */
export const inviteUserResponseSchema = z.object({
  user: userDtoSchema,
})

export type InviteUserResponse = z.infer<typeof inviteUserResponseSchema>

/**
 * PATCH /api/users/:id body (company-admin, own company). Email is the sign-in identity
 * and isn't editable. `status` only switches an account between active and inactive —
 * an invite still in progress keeps its own status.
 */
export const updateUserRequestSchema = z.object({
  /** Blank clears the name. */
  name: z
    .string()
    .trim()
    .max(200)
    .transform((name) => name || null),
  roleIds: z
    .array(roleIdSchema)
    .min(1)
    .transform((ids) => [...new Set(ids)]),
  status: z.enum(['active', 'inactive']).optional(),
})

export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>

/** PATCH /api/users/:id response: the user as saved. */
export const updateUserResponseSchema = z.object({
  user: userDtoSchema,
})

export type UpdateUserResponse = z.infer<typeof updateUserResponseSchema>
