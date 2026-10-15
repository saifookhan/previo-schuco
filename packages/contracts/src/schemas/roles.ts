import { z } from 'zod'

import { roleIdSchema } from './common'

/** One role, as listed on the roles page. `userCount` = users currently holding it. */
export const roleDtoSchema = z.object({
  id: roleIdSchema,
  name: z.string(),
  description: z.string(),
  builtIn: z.boolean(),
  userCount: z.number().int().nonnegative(),
})

export type RoleDto = z.infer<typeof roleDtoSchema>

/** GET /api/admin/roles response. */
export const rolesListResponseSchema = z.object({
  roles: z.array(roleDtoSchema),
})

export type RolesListResponse = z.infer<typeof rolesListResponseSchema>

/** GET /api/roles response: the roles a company-admin may give when adding a user. */
export const grantableRolesResponseSchema = z.object({
  roles: z.array(z.object({ id: roleIdSchema, name: z.string(), description: z.string() })),
})

export type GrantableRolesResponse = z.infer<typeof grantableRolesResponseSchema>

/** POST /api/admin/roles request body. The id is derived from the name. */
export const createRoleRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).optional(),
})

export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>
