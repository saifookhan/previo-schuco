import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // Several suites touch global tables (roles, role_permissions) in one shared test DB — run files one at a time.
    fileParallelism: false,
  },
})
