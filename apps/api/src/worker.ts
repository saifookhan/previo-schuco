import { bootstrapApiEnv } from '@schuco/env'

// Same reasoning as index.ts: resolve env before anything else loads,
// via a dynamic import so it's guaranteed to run first (ES module import
// hoisting would otherwise evaluate a plain top-level import before this
// call, regardless of source order).
bootstrapApiEnv()

await import('./worker-main')
