import { z } from 'zod'

import { userProfileSchema } from './auth'

/** POST /api/auth/login request body. */
export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export type LoginRequest = z.infer<typeof loginRequestSchema>

/** POST /api/auth/login response. */
export const loginResponseSchema = z.object({
  user: userProfileSchema,
})

export type LoginResponse = z.infer<typeof loginResponseSchema>

/** POST /api/auth/set-password request body — the same endpoint accepts both an invite token and a password-reset token. */
export const setPasswordRequestSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(10),
})

export type SetPasswordRequest = z.infer<typeof setPasswordRequestSchema>

/** POST /api/auth/set-password response. */
export const setPasswordResponseSchema = z.object({
  user: userProfileSchema,
})

export type SetPasswordResponse = z.infer<typeof setPasswordResponseSchema>

/** POST /api/auth/request-password-reset request body. */
export const requestPasswordResetRequestSchema = z.object({
  email: z.string().email(),
})

export type RequestPasswordResetRequest = z.infer<typeof requestPasswordResetRequestSchema>
