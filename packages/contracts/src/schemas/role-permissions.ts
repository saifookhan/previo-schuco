import { z } from 'zod'

import { PERMISSIONS } from '../permissions'

export const permissionSchema = z.enum(PERMISSIONS)

/** GET /api/admin/role-permissions response: the editable matrix plus what's needed to draw it. */
export const rolePermissionsResponseSchema = z.object({
  permissions: z.array(permissionSchema),
  roles: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
  matrix: z.record(z.string(), z.array(permissionSchema)),
  /** true while no custom matrix has been saved and the built-in defaults apply. */
  isDefault: z.boolean(),
})

export type RolePermissionsResponse = z.infer<typeof rolePermissionsResponseSchema>

/** PUT /api/admin/role-permissions request body: the complete matrix (role id → permissions). */
export const updateRolePermissionsRequestSchema = z.object({
  matrix: z.record(z.string(), z.array(permissionSchema)),
})

export type UpdateRolePermissionsRequest = z.infer<typeof updateRolePermissionsRequestSchema>
