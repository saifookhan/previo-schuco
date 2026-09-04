import { spawn } from 'node:child_process'

import { bootstrapWebEnv } from '@schuco/env'

/**
 * Resolve env BEFORE spawning `next`, then run it as a child process
 * inheriting the now-resolved env. Next.js inlines `NEXT_PUBLIC_*` vars
 * at the moment `next dev`/`build`/`start` itself boots (via webpack
 * `DefinePlugin`) — running the resolver inside `next.config.ts` or app
 * code would be too late for some of Next's env-handling paths, so this
 * spawns `next` as a genuinely separate process instead (ADR 0005).
 *
 * Usage: tsx scripts/bootstrap-env.ts <dev|build|start> [...extra args]
 */
const [subcommand, ...rest] = process.argv.slice(2)

if (!subcommand) {
  console.error('Usage: bootstrap-env.ts <dev|build|start> [...args]')
  process.exit(1)
}

bootstrapWebEnv()

// .env.local's PORT is apps/api's dev-server port (shared file, ADR
// 0005) — Next.js also respects a PORT env var for its own server, so
// left inherited it would make `next dev` try to bind the API's port
// instead of its own default. Web has no business reading this var.
const { PORT: _apiPort, ...webEnv } = process.env

const child = spawn('next', [subcommand, ...rest], {
  stdio: 'inherit',
  env: webEnv,
})

child.on('exit', (code) => process.exit(code ?? 0))
