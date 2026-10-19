import { defineJob, registerJob } from '@schuco/queue'
import { z } from 'zod'

import { logger } from '../lib/logger'

/**
 * Smoke-test job — proves the queue/worker pipeline (enqueue -> Redis ->
 * worker -> handler) end-to-end. Not a real feature; delete once a real
 * `email` domain job exists (e.g. invite-email, per ADR 0004's
 * reconciliation strategy) and this has served its purpose.
 */
export const echoJob = defineJob('email', 'echo', z.object({ message: z.string() }), 'platform')

export const echoJobRegistration = registerJob(echoJob, async (payload) => {
  logger.info({ job: 'echo', message: payload.message }, 'echo job received')
})
