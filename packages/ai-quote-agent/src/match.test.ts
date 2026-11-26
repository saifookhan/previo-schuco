import { describe, expect, it } from 'vitest'

import { expandQuery, nameMatches, samePosition, withoutSize } from './match'

describe('nameMatches', () => {
  it('ignores case and accents', () => {
    expect(nameMatches('Cassonetto Coibentato MyBox Revo', 'cassonetto mybox')).toBe(true)
    expect(nameMatches('Profondità 150', 'profondita 150')).toBe(true)
  })

  it('does not match a different depth', () => {
    expect(nameMatches('MyBox Revo Light profondità 80', 'profondita 150')).toBe(false)
  })

  it('matches a clipped or mistyped family label', () => {
    expect(nameMatches('ali - Cassonetto Coibentato MyBox Revo', 'ali - Cassonetto Coibentato MyBox Revost desc (copy)')).toBe(true)
  })
})

describe('samePosition', () => {
  it('matches Pos 1 from the words a user types', () => {
    expect(samePosition('1', 'pos 1')).toBe(true)
    expect(samePosition('P01', 'posizione 1')).toBe(true)
    expect(samePosition('1', '1')).toBe(true)
    expect(samePosition('10', 'pos 1')).toBe(false)
    expect(samePosition('1', 'the first one')).toBe(true)
    expect(samePosition('1', 'prima riga')).toBe(true)
  })
})

describe('withoutSize', () => {
  it('drops a size glued onto a product name', () => {
    expect(withoutSize('Cassonetto MyBox Revo Light profondità 80 1000×300')).toBe('Cassonetto MyBox Revo Light profondità 80')
    expect(nameMatches('Cassonetto MyBox Revo Light profondità 80', withoutSize('Cassonetto MyBox Revo Light profondità 80 1000×300'))).toBe(true)
  })
})

describe('expandQuery', () => {
  it('adds the catalog synonym for insect screen', () => {
    expect(expandQuery('insect screen')).toContain('zanzariera')
  })
})
