import { afterEach, describe, expect, it } from 'vitest'

import { isDevLoginAllowed } from '@schuco/env/dev-login'

const KEYS = ['ALLOW_DEV_LOGIN', 'NEXT_PUBLIC_ALLOW_DEV_LOGIN', 'NODE_ENV'] as const
const ORIGINAL = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of KEYS) {
    const value = ORIGINAL[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('isDevLoginAllowed', () => {
  it('is off when neither flag is set, including outside production', () => {
    delete process.env.ALLOW_DEV_LOGIN
    delete process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN
    process.env.NODE_ENV = 'development'
    expect(isDevLoginAllowed()).toBe(false)
  })

  it('ALLOW_DEV_LOGIN=false wins over the public flag', () => {
    process.env.ALLOW_DEV_LOGIN = 'false'
    process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN = 'true'
    process.env.NODE_ENV = 'development'
    expect(isDevLoginAllowed()).toBe(false)
  })

  it('is on in production only when the server flag is exactly true', () => {
    process.env.ALLOW_DEV_LOGIN = 'true'
    delete process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN
    process.env.NODE_ENV = 'production'
    expect(isDevLoginAllowed()).toBe(true)
  })

  it('uses the public flag when the server flag is unset, so local .env.local still works', () => {
    delete process.env.ALLOW_DEV_LOGIN
    process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN = 'true'
    process.env.NODE_ENV = 'production'
    expect(isDevLoginAllowed()).toBe(true)
  })
})
