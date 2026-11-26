import { describe, expect, it } from 'vitest'

import { placeActivity, type ActivityPlacement } from './activities'

const row = (description: string, included: boolean): ActivityPlacement => ({
  id: description,
  description,
  included,
  enabled: true,
})

describe('placeActivity', () => {
  it('adds a new activity to Included', () => {
    const result = placeActivity([row('Posa in opera', true)], row('saif testing', true))
    expect(result.action).toBe('added')
    expect(result.rows.map((item) => item.description)).toEqual(['Posa in opera', 'saif testing'])
    expect(result.rows[1]?.included).toBe(true)
  })

  it('does not add the same description twice', () => {
    const result = placeActivity([row('Saif testing', true)], { ...row('saif testing', true), id: 'new' })
    expect(result.action).toBe('unchanged')
    expect(result.rows).toHaveLength(1)
  })

  it('moves an existing activity to Not included', () => {
    const result = placeActivity([row('saif testing', true)], row('saif testing', false))
    expect(result.action).toBe('updated')
    expect(result.rows[0]?.included).toBe(false)
    expect(result.rows[0]?.id).toBe('saif testing')
  })
})
