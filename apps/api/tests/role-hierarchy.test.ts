import { describe, expect, it } from 'vitest'

import { canGrantRole, canGrantByPermissions } from '../src/lib/role-hierarchy'

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

  it('fails closed for a caller role not in the table (e.g. super-user, user)', () => {
    expect(canGrantRole('super-user', 'user')).toBe(false)
    expect(canGrantRole('user', 'user')).toBe(false)
    expect(canGrantRole('some-future-role', 'user')).toBe(false)
  })
})

describe('canGrantByPermissions', () => {
  const matrix = {
    'company-admin': ['catalog.view', 'catalog.edit', 'users.manage'],
    'super-user': ['catalog.view', 'catalog.edit'],
    auditor: ['catalog.view'],
    'power-role': ['catalog.view', 'catalog.edit', 'catalog.share'],
  } as const

  it('lets a caller hand out a role whose permissions it already holds', () => {
    expect(canGrantByPermissions(['company-admin'], ['super-user', 'auditor'], matrix)).toBe(true)
  })

  it('refuses a role that carries a permission the caller lacks (no escalation through custom roles)', () => {
    expect(canGrantByPermissions(['company-admin'], ['power-role'], matrix)).toBe(false)
  })

  it('counts permissions across all of the caller\'s roles, and never limits a super-admin', () => {
    expect(canGrantByPermissions(['auditor', 'power-role'], ['power-role'], matrix)).toBe(true)
    expect(canGrantByPermissions(['super-admin'], ['power-role'], matrix)).toBe(true)
  })
})
