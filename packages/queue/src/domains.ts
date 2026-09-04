/**
 * One BullMQ Queue per job domain, not per individual job type (ADR 0009).
 * Each domain gets its own concurrency/rate-limit tuning; job *types*
 * within a domain are BullMQ job `name`s on that queue.
 */
export const JOB_DOMAINS = ['email', 'documents', 'import-export'] as const

export type JobDomain = (typeof JOB_DOMAINS)[number]

/** Per-domain worker concurrency defaults — CPU-heavy domains stay low. */
export const DOMAIN_CONCURRENCY: Record<JobDomain, number> = {
  email: 10,
  documents: 2,
  'import-export': 3,
}

/** Per-domain default job timeout (ms) — see ADR 0009's failure semantics. */
export const DOMAIN_JOB_TIMEOUT_MS: Record<JobDomain, number> = {
  email: 30_000,
  documents: 120_000,
  'import-export': 300_000,
}
