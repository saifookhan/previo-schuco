import { z } from 'zod'

/**
 * Environment names a `*_TARGET` var can point a dependency at (ADR 0005).
 * `'local'` is always resolvable from `.env.local` alone; every other
 * target's credentials live in a separate, fetched `.env.<target>.local`
 * file. There is deliberately no `'prod'`/`'production'` value here — no
 * local-dev code path may ever point at production (ADR 0005, ADR 0011).
 */
export const ENV_TARGETS = ['local', 'dev', 'staging'] as const

export type EnvTarget = (typeof ENV_TARGETS)[number]

export const envTargetSchema = z.enum(ENV_TARGETS)
