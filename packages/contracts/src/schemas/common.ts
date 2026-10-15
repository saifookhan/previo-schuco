import { z } from 'zod'

/** The four roles every installation has; they cannot be deleted. Super-admins can add more (custom roles). */
export const BUILTIN_ROLE_IDS = ['super-admin', 'company-admin', 'super-user', 'user'] as const

export const isBuiltInRole = (roleId: string): boolean => (BUILTIN_ROLE_IDS as readonly string[]).includes(roleId)

/** A role identifier — one of the built-in roles, or a custom role's slug. */
export const roleIdSchema = z.string().min(1)

export type RoleId = z.infer<typeof roleIdSchema>

/** Standard API error payload. */
export const errorResponseSchema = z.object({
  error: z.union([z.string(), z.record(z.unknown())]),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>

/** Health check response. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
