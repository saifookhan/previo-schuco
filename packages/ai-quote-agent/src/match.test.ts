import { describe, expect, it } from 'vitest'

import { expandQuery, nameMatches } from './match'

describe('nameMatches', () => {
  it('ignores case and accents', () => {
    expect(nameMatches('Cassonetto Coibentato MyBox Revo', 'cassonetto mybox')).toBe(true)
    expect(nameMatches('Profondità 150', 'profondita 150')).toBe(true)
  })

  it('does not match a different depth', () => {
    expect(nameMatches('MyBox Revo Light profondità 80', 'profondita 150')).toBe(false)
  })
})

describe('expandQuery', () => {
  it('adds the catalog synonym for insect screen', () => {
    expect(expandQuery('insect screen')).toContain('zanzariera')
  })
})
