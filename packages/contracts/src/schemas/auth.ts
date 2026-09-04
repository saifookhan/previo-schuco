import { z } from 'zod'

import { roleIdSchema } from './common'

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
  cognitoSub: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  status: z.enum(['invited', 'active', 'inactive']),
  role: z.object({
    id: roleIdSchema,
    name: z.string(),
    description: z.string(),
  }),
  company: z.object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.enum(['platform', 'supplier', 'client']),
    vatNumber: z.string(),
  }),
  businessUnits: z.array(businessUnitScopeSchema),
})

export type UserProfile = z.infer<typeof userProfileSchema>

/** GET /api/me response. */
export const meResponseSchema = z.object({
  user: userProfileSchema,
})

export type MeResponse = z.infer<typeof meResponseSchema>
