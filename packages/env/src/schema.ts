import { z } from 'zod'

const formatIssues = (issues: z.ZodIssue[]): string =>
  issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n')

export const apiEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),
  COGNITO_REGION: z.string().optional(),
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  REDIS_URL: z.string().url().optional(),
})

/** Validate the fully-resolved `process.env` for `apps/api`. Throws one formatted error listing every problem, not just the first. */
export const validateApiEnv = (): void => {
  const result = apiEnvSchema.safeParse(process.env)
  if (!result.success) {
    throw new Error(`Invalid API environment:\n${formatIssues(result.error.issues)}`)
  }
}

export const webEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
  NEXT_PUBLIC_COGNITO_REGION: z.string().optional(),
  NEXT_PUBLIC_COGNITO_USER_POOL_ID: z.string().optional(),
  NEXT_PUBLIC_COGNITO_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_COGNITO_DOMAIN: z.string().optional(),
})

/** Validate the fully-resolved `process.env` for `apps/web`. Throws one formatted error listing every problem, not just the first. */
export const validateWebEnv = (): void => {
  const result = webEnvSchema.safeParse(process.env)
  if (!result.success) {
    throw new Error(`Invalid web environment:\n${formatIssues(result.error.issues)}`)
  }
}
