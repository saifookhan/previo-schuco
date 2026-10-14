import { z } from 'zod'

import { roleIdSchema } from './common'
import { companyCapabilitiesSchema } from './companies'
import { permissionSchema } from './role-permissions'

/** Business unit scope returned with user profile. */
export const businessUnitScopeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  canEdit: z.boolean(),
})

export type BusinessUnitScope = z.infer<typeof businessUnitScopeSchema>

/** Authenticated user profile with RBAC context. */
export const userProfileSchema = z.object({
  id: z.string().uuid(),
  cognitoSub: z.string().nullable(),
  email: z.string().email(),
  name: z.string().nullable(),
  status: z.enum(['pending_approval', 'invited', 'invite_failed', 'active', 'inactive']),
  /** Primary (highest-ranked) role. */
  role: z.object({
    id: roleIdSchema,
    name: z.string(),
    description: z.string(),
  }),
  /** Every role the user holds, highest rank first; includes the primary. */
  roles: z.array(
    z.object({
      id: roleIdSchema,
      name: z.string(),
      description: z.string(),
    }),
  ),
  company: z.object({
    id: z.string().uuid(),
    name: z.string(),
    capabilities: companyCapabilitiesSchema,
    vatNumber: z.string(),
  }),
  businessUnits: z.array(businessUnitScopeSchema),
  /** Effective permissions (saved role matrix ∩ company capabilities). Returned by /api/me. */
  permissions: z.array(permissionSchema).optional(),
})

export type UserProfile = z.infer<typeof userProfileSchema>

/** GET /api/me response. */
export const meResponseSchema = z.object({
  user: userProfileSchema,
})

export type MeResponse = z.infer<typeof meResponseSchema>
