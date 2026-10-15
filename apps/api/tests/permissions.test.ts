import { computePermissions } from '@schuco/contracts'
import { describe, expect, it } from 'vitest'

const caps = (c: Partial<Record<'platform' | 'manufacturer' | 'supplier' | 'client', boolean>>) => ({
  platform: false,
  manufacturer: false,
  supplier: false,
  client: false,
  ...c,
})

describe('computePermissions', () => {
  it('a manufacturer company-admin edits the catalog but cannot quote', () => {
    const p = computePermissions(['company-admin'], caps({ manufacturer: true }))
    expect(p).toContain('catalog.edit')
    expect(p).not.toContain('quote.edit')
  })

  it('a supplier user can quote but not edit the catalog, even as company-admin', () => {
    const p = computePermissions(['company-admin'], caps({ supplier: true }))
    expect(p).toContain('quote.edit')
    expect(p).toContain('catalog.view')
    expect(p).not.toContain('catalog.edit')
  })

  it('a company that is both manufacturer and supplier gets both, limited by the role', () => {
    const admin = computePermissions(['company-admin'], caps({ manufacturer: true, supplier: true }))
    expect(admin).toEqual(expect.arrayContaining(['catalog.edit', 'quote.edit']))
    const plainUser = computePermissions(['user'], caps({ manufacturer: true, supplier: true }))
    expect(plainUser).toContain('quote.edit')
    expect(plainUser).not.toContain('catalog.edit')
  })

  it('several roles combine (union), then the company capability filters', () => {
    const p = computePermissions(['user', 'super-user'], caps({ manufacturer: true }))
    expect(p).toContain('catalog.edit')
    expect(p).not.toContain('quote.edit')
  })

  it('a client only browses the catalog', () => {
    const p = computePermissions(['company-admin'], caps({ client: true }))
    expect(p).toEqual(expect.arrayContaining(['catalog.view', 'users.manage']))
    expect(p).not.toContain('catalog.edit')
    expect(p).not.toContain('quote.edit')
  })

  it('super-admin is cross-tenant and bypasses the capability filter', () => {
    const p = computePermissions(['super-admin'], caps({ platform: true }))
    expect(p).toEqual(expect.arrayContaining(['catalog.edit', 'catalog.share', 'quote.edit']))
  })

  it('manufacturers and suppliers can share families; a client cannot', () => {
    expect(computePermissions(['company-admin'], caps({ manufacturer: true }))).toContain('catalog.share')
    expect(computePermissions(['company-admin'], caps({ supplier: true }))).toContain('catalog.share')
    expect(computePermissions(['company-admin'], caps({ client: true }))).not.toContain('catalog.share')
    expect(computePermissions(['user'], caps({ supplier: true }))).not.toContain('catalog.share')
  })
})
