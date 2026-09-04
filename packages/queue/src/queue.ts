import { Queue, type JobsOptions } from 'bullmq'

import { getQueueConnection } from './connection'
import type { JobDomain } from './domains'

const queues = new Map<JobDomain, Queue>()

/**
 * Default job options applied to every job in every domain (ADR 0009):
 * bounded retries with exponential backoff, bounded completed/failed job
 * retention. Callers may override per-enqueue via `defineJob(...).enqueue`.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
}

/** Get (or create) the shared Queue for a job domain. */
export const getQueue = (domain: JobDomain): Queue => {
  let queue = queues.get(domain)
  if (!queue) {
    queue = new Queue(domain, { connection: getQueueConnection() })
    queues.set(domain, queue)
  }
  return queue
}

/** Close every open Queue — call on graceful shutdown. */
export const closeQueues = async (): Promise<void> => {
  await Promise.all([...queues.values()].map((queue) => queue.close()))
  queues.clear()
}
