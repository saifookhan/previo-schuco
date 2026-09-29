import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Walk up from `startDir` (default: cwd) until a `pnpm-workspace.yaml` is
 * found — that directory is the monorepo root. Deliberately not a fixed
 * relative path (`../..`) so this works the same whether it's called from
 * `apps/api`, `apps/web`, a Docker `WORKDIR`, or a test runner's cwd.
 */
export const findRepoRoot = (startDir: string = process.cwd()): string => {
  let dir = startDir
  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(
        `Could not find repo root (no pnpm-workspace.yaml found walking up from ${startDir})`,
      )
    }
    dir = parent
  }
}
