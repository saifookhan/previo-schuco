import { Worker, type Job } from 'bullmq'
import type { z, ZodType } from 'zod'

import { getQueueConnection } from './connection'
import { DOMAIN_CONCURRENCY, DOMAIN_JOB_TIMEOUT_MS, type JobDomain } from './domains'
import type { JobDefinition } from './define-job'

/**
 * Type-erased registration, so a worker can hold a heterogeneous list of
 * job registrations (each with its own payload type) in one array. Build
 * one with `registerJob`, not by constructing this shape directly.
 */
export interface JobRegistration {
  job: JobDefinition<ZodType>
  handler: (payload: unknown, job: Job) => Promise<void>
}

/**
 * Pair a job definition with its handler, for passing to `createWorker`.
 * Must be idempotent on retry — BullMQ gives at-least-once execution, not
 * exactly-once (ADR 0009): a worker can crash after performing a side
 * effect but before acknowledging the job, and the retried job will run
 * this handler again. For a duplicate side effect that's user-visible and
 * unacceptable (e.g. sending an email twice), the handler must
 * check-and-record an application-level delivery ledger before performing
 * the external call, not rely on this function only running once.
 * @param job - A `defineJob(...)` result
 * @param handler - Handler for this job's payload type
 */
export const registerJob = <Schema extends ZodType>(
  job: JobDefinition<Schema>,
  handler: (payload: z.infer<Schema>, jobRecord: Job) => Promise<void>,
): JobRegistration => ({
  job: job as unknown as JobDefinition<ZodType>,
  handler: handler as (payload: unknown, jobRecord: Job) => Promise<void>,
})

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Job "${label}" exceeded timeout of ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

/**
 * Create a BullMQ Worker for one job domain, dispatching by job name to the
 * matching registered handler. Concurrency and per-job timeout come from
 * the domain's defaults (`packages/queue/src/domains.ts`) — a job that
 * exceeds its timeout is treated as failed (triggers retry/backoff), never
 * left to run indefinitely.
 * @param domain - Job domain this worker processes
 * @param registrations - Job definitions + handlers for jobs in this domain
 */
export const createWorker = (domain: JobDomain, registrations: JobRegistration[]): Worker => {
  const handlersByName = new Map(registrations.map((r) => [r.job.name, r]))
  const timeoutMs = DOMAIN_JOB_TIMEOUT_MS[domain]

  return new Worker(
    domain,
    async (job: Job) => {
      const registration = handlersByName.get(job.name)
      if (!registration) {
        throw new Error(`No handler registered for job "${job.name}" in domain "${domain}"`)
      }
      // Re-validate on the consume side too — Redis could hold a payload
      // enqueued by an older process with a since-changed schema.
      const payload = registration.job.schema.parse(job.data)

      // `scope` (ADR 0009, defineJob) is otherwise documentation-only — a
      // 'tenant' job's handler is trusted to open its own
      // withRlsTransaction, and nothing here would notice if it didn't.
      // This package doesn't depend on @schuco/db, so it can't open that
      // transaction itself, but it CAN refuse to dispatch a 'tenant' job
      // whose payload has no companyId to scope by — the cheapest check
      // that catches the actual failure mode (a tenant job silently
      // running with no tenant context) without a bigger coupling change.
      if (registration.job.scope === 'tenant') {
        const companyId = (payload as { companyId?: unknown })?.companyId
        if (typeof companyId !== 'string' || companyId.length === 0) {
          throw new Error(
            `Job "${job.name}" is tenant-scoped but its payload has no companyId — refusing to dispatch. Give the schema a companyId: string field.`,
          )
        }
      }

      await withTimeout(registration.handler(payload, job), timeoutMs, job.name)
    },
    {
      connection: getQueueConnection(),
      concurrency: DOMAIN_CONCURRENCY[domain],
    },
  )
}

/**
 * Stop accepting new jobs and let in-flight ones finish (within their
 * timeout) before resolving — call from a SIGTERM/SIGINT handler in the
 * worker entrypoint, not `worker.disconnect()` or process.exit directly,
 * to avoid the crash-before-ack duplicate-side-effect scenario documented
 * on `JobRegistration.handler` above.
 */
export const closeWorkerGracefully = (worker: Worker): Promise<void> => worker.close()
