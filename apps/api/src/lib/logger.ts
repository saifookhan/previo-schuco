import pino from 'pino'

/**
 * The API/worker's single logger. One JSON object per line whenever output
 * isn't a terminal (every Docker container, the server's included) —
 * `docker compose logs api | jq` can filter it, and every line from a request
 * carries its `requestId` (the same id the audit log stores, ADR 0010).
 * Pretty-printed when run in a terminal (`pnpm dev:api`); `LOG_FORMAT=json|pretty`
 * overrides. Silent under vitest unless LOG_LEVEL says otherwise.
 *
 * Never log secrets: passwords, session tokens, Authorization headers.
 */
const isTest = Boolean(process.env.VITEST)
const pretty = !isTest && (process.env.LOG_FORMAT ? process.env.LOG_FORMAT === 'pretty' : Boolean(process.stdout.isTTY))

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? 'silent' : 'info'),
  base: { service: process.env.LOG_SERVICE ?? 'api' },
  redact: {
    paths: ['password', '*.password', 'token', '*.token', 'authorization', '*.authorization', 'headers.authorization'],
    censor: '[redacted]',
  },
  ...(pretty
    ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' } } }
    : {}),
})
