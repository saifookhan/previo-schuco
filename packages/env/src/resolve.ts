import { existsSync } from 'node:fs'
import { join } from 'node:path'

import dotenv from 'dotenv'

import { envTargetSchema } from './targets'

const loadedTargetFiles = new Set<string>()

export type LocalEnvMode = 'env-local' | 'legacy-env' | 'none'

/**
 * Load `.env.local` — target selections (`DB_TARGET=...`) plus
 * non-secret local values and `local` target's own credentials (local
 * Docker Postgres/Redis aren't real secrets, so they live here directly,
 * no separate file needed). Falls back to a legacy flat `.env` with a
 * deprecation warning if `.env.local` doesn't exist yet, so the
 * pre-existing local workflow keeps working unmodified until a developer
 * migrates (ADR 0005).
 *
 * Returns which mode was used — callers must check this: in `'legacy-env'`
 * mode, vars like `DATABASE_URL` are already fully resolved (that's all
 * a flat `.env` ever had), so per-target resolution must be SKIPPED
 * entirely, not run and fail looking for a `DATABASE_URL_LOCAL` that a
 * flat file was never going to have.
 */
export const loadLocalEnvFile = (repoRoot: string): LocalEnvMode => {
  const envLocalPath = join(repoRoot, '.env.local')
  if (existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath })
    return 'env-local'
  }

  const legacyPath = join(repoRoot, '.env')
  if (existsSync(legacyPath)) {
    dotenv.config({ path: legacyPath })
    // eslint-disable-next-line no-console
    console.warn(
      '[@schuco/env] .env is deprecated — migrate to .env.local (see docs/environments.md). Falling back to legacy .env for now.',
    )
    return 'legacy-env'
  }

  return 'none'
}

const loadTargetEnvFile = (repoRoot: string, target: string): void => {
  if (target === 'local' || loadedTargetFiles.has(target)) {
    return
  }

  const filePath = join(repoRoot, `.env.${target}.local`)
  if (!existsSync(filePath)) {
    throw new Error(
      `Missing ${filePath} — run \`pnpm env:fetch ${target}\` to fetch ${target} credentials (see docs/environments.md).`,
    )
  }

  dotenv.config({ path: filePath })
  loadedTargetFiles.add(target)
}

export interface ResolveSpec {
  /** Env var naming the target for this dependency, e.g. `DB_TARGET`. */
  targetVar: string
  /** Env var this resolves to — what the rest of the code already reads, e.g. `DATABASE_URL`. */
  outputVar: string
  /** Prefix of the per-target source vars, e.g. `DATABASE_URL` -> `DATABASE_URL_DEV`. */
  sourcePrefix: string
  /** If false, a missing value is silently skipped rather than throwing (default true). */
  required?: boolean
}

/**
 * Resolve one dependency's env var from its per-target value (ADR 0005):
 * `<targetVar>` picks the environment, `<sourcePrefix>_<TARGET>` supplies
 * the value (from `.env.local` for `local`, or the fetched
 * `.env.<target>.local` for anything else), written to `<outputVar>` —
 * mutates `process.env` in place so downstream code needs zero changes.
 */
export const resolveEnvVar = (repoRoot: string, spec: ResolveSpec): void => {
  // Already resolved — by direct injection (Docker/ECS env, CI), a
  // legacy flat .env, or a previous call — nothing to do. This makes
  // target resolution opt-in per var rather than mandatory: an
  // environment that already provides e.g. DATABASE_URL directly works
  // unchanged with zero *_TARGET vars set anywhere, which is exactly
  // Docker Compose's model (env vars injected into the container, no
  // dotenv file involved at all).
  if (process.env[spec.outputVar]) {
    return
  }

  const rawTarget = process.env[spec.targetVar] ?? 'local'
  const parsed = envTargetSchema.safeParse(rawTarget)
  if (!parsed.success) {
    throw new Error(
      `Invalid ${spec.targetVar}="${rawTarget}" — must be one of: ${envTargetSchema.options.join(', ')}`,
    )
  }
  const target = parsed.data

  loadTargetEnvFile(repoRoot, target)

  const sourceVar = `${spec.sourcePrefix}_${target.toUpperCase()}`
  const value = process.env[sourceVar]

  if (!value) {
    if (spec.required === false) {
      return
    }
    const hint = target === 'local' ? '.env.local' : `.env.local or .env.${target}.local`
    throw new Error(`Missing ${sourceVar} (needed because ${spec.targetVar}=${target}) — check ${hint}.`)
  }

  process.env[spec.outputVar] = value
}

export const resolveEnvVars = (repoRoot: string, specs: ResolveSpec[]): void => {
  for (const spec of specs) {
    resolveEnvVar(repoRoot, spec)
  }
}
