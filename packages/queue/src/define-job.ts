import type { JobsOptions } from 'bullmq'
import type { z, ZodType } from 'zod'

import { DEFAULT_JOB_OPTIONS, getQueue } from './queue'
import type { JobDomain } from './domains'

/**
 * A job's DB access mode, fixed at declaration time — never inferred from
 * payload data (ADR 0009). `'tenant'` jobs must carry `companyId` in their
 * payload and run with RLS enforced for that company (never
 * `isSuperAdmin: true`); the worker uses `withRlsTransaction`, the same
 * mechanism `requireAuth` uses (ADR 0006). `'platform'` jobs are the
 * explicit, named exception for genuinely cross-tenant work — declaring a
 * job `'platform'`-scoped is itself the reviewed decision that it may
 * bypass tenant restriction, not a flag a payload can set.
 */
export type JobScope = 'tenant' | 'platform'

export interface JobDefinition<Schema extends ZodType> {
  domain: JobDomain
  name: string
  scope: JobScope
  schema: Schema
  /**
   * Enqueue a job. Payload is validated against `schema` before it ever
   * reaches Redis — a malformed enqueue call fails at the call site, not
   * inside a worker later. Pass `jobId` for deterministic dedup (ADR
   * 0009 — required for anything where a duplicate *enqueue* must not
   * create a second pending job; it does not by itself make retries of
   * the same job idempotent, see the handler-side idempotency note). Key
   * `jobId` to the specific event/attempt (e.g. an invitation id), not to
   * a long-lived entity that can legitimately trigger this job more than
   * once — otherwise a correct second send can be silently swallowed by
   * dedup against a stale first attempt.
   */
  enqueue: (payload: z.infer<Schema>, opts?: JobsOptions) => Promise<void>
}

/**
 * Declare a job type: a Zod payload schema plus a typed `enqueue` — callers
 * never construct a raw BullMQ `Queue.add()` call with an untyped payload
 * (ADR 0009). Register the matching handler for this job with
 * `createWorker` in the same domain's worker.
 * @param domain - Job domain (one BullMQ Queue per domain, not per job type)
 * @param name - Job name, unique within its domain
 * @param scope - `'tenant'` (default) requires `companyId` in the payload
 *   and runs RLS-scoped; `'platform'` is the explicit, reviewed exception
 *   for genuinely cross-tenant work
 * @param schema - Zod schema the payload must satisfy — for `'tenant'`
 *   scope, must include a `companyId: string` field
 */
export const defineJob = <Schema extends ZodType>(
  domain: JobDomain,
  name: string,
  schema: Schema,
  scope: JobScope = 'tenant',
): JobDefinition<Schema> => ({
  domain,
  name,
  scope,
  schema,
  enqueue: async (payload, opts) => {
    const parsed = schema.parse(payload)
    await getQueue(domain).add(name, parsed, { ...DEFAULT_JOB_OPTIONS, ...opts })
  },
})
