import { closeQueueConnection, closeWorkerGracefully, createWorker } from '@schuco/queue'

import { echoJobRegistration } from './jobs/echo'
import { logger } from './lib/logger'

/**
 * Background job worker entrypoint (ADR 0009). Ships from the same Docker
 * image as the API but runs as its own process/ECS service — never inside
 * the request-handling process — so a slow job can't starve HTTP traffic.
 */
const emailWorker = createWorker('email', [echoJobRegistration])
const documentsWorker = createWorker('documents', [])
const importExportWorker = createWorker('import-export', [])

const workers = [emailWorker, documentsWorker, importExportWorker]

logger.info({ domains: ['email', 'documents', 'import-export'] }, 'Schuco worker running')

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'closing workers gracefully')
  await Promise.all(workers.map((worker) => closeWorkerGracefully(worker)))
  await closeQueueConnection()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
