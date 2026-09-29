import IORedis from 'ioredis'

let connection: IORedis | null = null

/**
 * Shared Redis connection for BullMQ queues/workers in this process.
 * BullMQ requires `maxRetriesPerRequest: null` on the connection it's given
 * (its own retry/backoff logic manages reconnects) — do not remove that.
 */
export const getQueueConnection = (): IORedis => {
  if (!connection) {
    const url = process.env.REDIS_URL
    if (!url) {
      throw new Error('REDIS_URL is not set')
    }
    connection = new IORedis(url, { maxRetriesPerRequest: null })
  }
  return connection
}

/** Close the shared Redis connection — call on graceful worker shutdown. */
export const closeQueueConnection = async (): Promise<void> => {
  if (connection) {
    await connection.quit()
    connection = null
  }
}
