import { z } from 'zod'

/** Canonical PREVIO role identifiers. */
export const roleIdSchema = z.enum([
  'super-admin',
  'company-admin',
  'super-user',
  'user',
])

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
