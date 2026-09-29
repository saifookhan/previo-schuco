import { findRepoRoot } from './repo-root'
import { loadLocalEnvFile, resolveEnvVars } from './resolve'
import { validateApiEnv, validateWebEnv } from './schema'

export { ENV_TARGETS, envTargetSchema, type EnvTarget } from './targets'
export { findRepoRoot } from './repo-root'
export {
  loadLocalEnvFile,
  resolveEnvVar,
  resolveEnvVars,
  type LocalEnvMode,
  type ResolveSpec,
} from './resolve'
export { apiEnvSchema, validateApiEnv, validateWebEnv, webEnvSchema } from './schema'

/**
 * Resolve and validate `apps/api`'s environment (ADR 0005). Call this
 * before anything else reads `process.env` — first line of the process
 * entrypoint, before any other import that touches env at module-eval
 * time. Mutates `process.env` in place; downstream code (`lib/db.ts`) is
 * unchanged.
 *
 * Safe to call in every environment as-is: if `DATABASE_URL` etc. are
 * already set directly (Docker/ECS env injection, a legacy flat `.env`),
 * `resolveEnvVar` no-ops for each of them — target resolution only
 * kicks in for a var that isn't already resolved.
 */
export const bootstrapApiEnv = (): void => {
  const repoRoot = findRepoRoot()
  loadLocalEnvFile(repoRoot)

  resolveEnvVars(repoRoot, [
    { targetVar: 'DB_TARGET', outputVar: 'DATABASE_URL', sourcePrefix: 'DATABASE_URL' },
    { targetVar: 'REDIS_TARGET', outputVar: 'REDIS_URL', sourcePrefix: 'REDIS_URL', required: false },
  ])

  validateApiEnv()
}

/**
 * Resolve and validate `apps/web`'s environment (ADR 0005). Must run
 * BEFORE the `next` CLI process starts — Next.js inlines `NEXT_PUBLIC_*`
 * vars at build/dev-server-start time via webpack `DefinePlugin`, driven
 * by whatever's in `process.env` at that moment. Call this from a wrapper
 * script that then spawns `next` as a child process with the now-resolved
 * env (see `apps/web/scripts/bootstrap-env.ts`), never from `next.config.ts`
 * or app code — by the time either of those run, it's too late for some
 * of Next's env handling paths.
 */
export const bootstrapWebEnv = (): void => {
  const repoRoot = findRepoRoot()
  loadLocalEnvFile(repoRoot)

  if (!process.env.API_TARGET) {
    process.env.API_TARGET = 'local'
  }
  if (!process.env.COGNITO_TARGET) {
    process.env.COGNITO_TARGET = process.env.API_TARGET
  }

  resolveEnvVars(repoRoot, [
    { targetVar: 'API_TARGET', outputVar: 'NEXT_PUBLIC_API_URL', sourcePrefix: 'API_URL' },
    {
      targetVar: 'COGNITO_TARGET',
      outputVar: 'NEXT_PUBLIC_COGNITO_REGION',
      sourcePrefix: 'COGNITO_REGION',
      required: false,
    },
    {
      targetVar: 'COGNITO_TARGET',
      outputVar: 'NEXT_PUBLIC_COGNITO_USER_POOL_ID',
      sourcePrefix: 'COGNITO_USER_POOL_ID',
      required: false,
    },
    {
      targetVar: 'COGNITO_TARGET',
      outputVar: 'NEXT_PUBLIC_COGNITO_CLIENT_ID',
      sourcePrefix: 'COGNITO_CLIENT_ID',
      required: false,
    },
    {
      targetVar: 'COGNITO_TARGET',
      outputVar: 'NEXT_PUBLIC_COGNITO_DOMAIN',
      sourcePrefix: 'COGNITO_DOMAIN',
      required: false,
    },
  ])

  // AUTH_SECRET is not target-resolved — it's a single value in
  // .env.local for local dev; deployed Vercel environments set it
  // directly as a Vercel env var (see docs/deployment.md, ADR 0011), not
  // through this per-target file scheme.
  validateWebEnv()
}
