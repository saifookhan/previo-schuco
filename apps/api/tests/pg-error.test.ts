import { describe, expect, it } from 'vitest'

import { PG_UNIQUE_VIOLATION, pgErrorCode } from '../src/lib/pg-error'

describe('pgErrorCode', () => {
  it('reads the code from a raw driver error and from a drizzle-wrapped one (code on cause)', () => {
    expect(pgErrorCode({ code: PG_UNIQUE_VIOLATION })).toBe(PG_UNIQUE_VIOLATION)
    expect(pgErrorCode({ message: 'Failed query', cause: { code: PG_UNIQUE_VIOLATION } })).toBe(PG_UNIQUE_VIOLATION)
  })

  it('returns undefined for anything else', () => {
    expect(pgErrorCode(new Error('boom'))).toBeUndefined()
    expect(pgErrorCode(null)).toBeUndefined()
    expect(pgErrorCode('x')).toBeUndefined()
  })
})
