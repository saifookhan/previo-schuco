import { describe, expect, it } from 'vitest'

import { canGrantRole } from '../src/lib/role-hierarchy'

/**
 * Pure unit test (ADR 0012, category "unit" — no DB) for the guard behind
 * the self-scoped invite route's privilege-escalation fix: a company-admin
 * must never be able to grant super-admin to an invitee.
 */
describe('canGrantRole', () => {
  it('lets a company-admin grant company-admin, super-user, or user', () => {
    expect(canGrantRole('company-admin', 'company-admin')).toBe(true)
    expect(canGrantRole('company-admin', 'super-user')).toBe(true)
    expect(canGrantRole('company-admin', 'user')).toBe(true)
  })

  it('never lets a company-admin grant super-admin', () => {
    expect(canGrantRole('company-admin', 'super-admin')).toBe(false)
  })

  it('lets a super-admin grant any role, including super-admin', () => {
    expect(canGrantRole('super-admin', 'super-admin')).toBe(true)
    expect(canGrantRole('super-admin', 'company-admin')).toBe(true)
  })
})
