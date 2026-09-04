import { bootstrapApiEnv } from '@schuco/env'

// Resolve env into process.env BEFORE anything else loads (ADR 0005).
// A plain top-level `import` further down would be hoisted and evaluated
// before this call runs regardless of source order (ES module semantics),
// so the actual app is loaded via a dynamic import instead — that's a
// runtime operation, guaranteed to happen after the synchronous call
// above it.
bootstrapApiEnv()

await import('./server')
