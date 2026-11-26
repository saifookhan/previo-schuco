import { describe, expect, it } from 'vitest'

import { issueConfirmToken, verifyConfirmToken } from './confirm'
import { catalogQuery } from './match'
import {
  choiceIndex,
  detectLanguage,
  isEditRequest,
  isNewQuoteRequest,
  resolveDirectAction,
  userGaveSize,
} from './intent'

describe('edit versus add', () => {
  it('treats a named row change as an edit', () => {
    const edits = [
      'metti IVA 10% sulla riga Macchina VMC',
      'sconto 10% sulla Macchina VMC',
      'set the price of Macchina VMC to 500',
      'cambia la misura della Macchina VMC a 1200x350',
      'set installation hours of the VMC row to 2',
      'aggiungi un ricarico del 5% alla Macchina VMC',
    ]
    for (const input of edits) expect(isEditRequest(input)).toBe(true)
  })

  it('does not treat a new sized product as an edit', () => {
    expect(isEditRequest('add product confizione 2000 x 2000')).toBe(false)
    expect(isNewQuoteRequest('Crea un nuovo preventivo per il cliente TEST')).toBe(true)
    expect(isNewQuoteRequest('cambia il cliente in Rossi Srl')).toBe(false)
  })
})

describe('sizes and choices', () => {
  it('accepts only a size the user typed', () => {
    expect(userGaveSize(['aggiungi confezione 30 filtri compact'], 1200, 1400)).toBe(false)
    expect(userGaveSize(['aggiungi confezione', '2000x2000'], 2000, 2000)).toBe(true)
  })

  it('resolves 1, the first, and la seconda', () => {
    expect(choiceIndex('1', 5)).toBe(0)
    expect(choiceIndex('the first', 5)).toBe(0)
    expect(choiceIndex('la seconda', 5)).toBe(1)
    expect(choiceIndex('which one?', 5)).toBeNull()
  })

  it('runs the pending chip instead of asking again', () => {
    const action = resolveDirectAction({
      latestUser: '1',
      pendingChoices: [
        { label: 'one', message: 'one', action: { tool: 'add_product', args: { lineName: 'A' } } },
        { label: 'two', message: 'two', action: { tool: 'add_product', args: { lineName: 'B' } } },
      ],
    })
    expect(action).toEqual({ tool: 'add_product', args: { lineName: 'A' } })
  })
})

describe('language and catalog query', () => {
  it('detects Italian, English, and German', () => {
    expect(detectLanguage('metti IVA sulla riga', 'en')).toBe('it')
    expect(detectLanguage('set the price of the row', 'it')).toBe('en')
    expect(detectLanguage('Bitte die Zeile hinzufügen', 'it')).toBe('de')
  })

  it('keeps the product words from an add sentence', () => {
    expect(catalogQuery('aggiungi confezione 30 filtri compact')).toBe('confezione 30 filtri compact')
  })
})

describe('confirm token', () => {
  const claims = { quoteId: 'q', revision: 3, tool: 'remove_line', args: { lineName: 'l-1' } }

  it('accepts a fresh token and rejects a changed argument', () => {
    const token = issueConfirmToken('secret', claims, 1_000)
    expect(verifyConfirmToken('secret', token, claims, 1_000).ok).toBe(true)
    expect(verifyConfirmToken('secret', token, { ...claims, args: { lineName: 'l-2' } }, 1_000).ok).toBe(false)
  })

  it('expires after five minutes', () => {
    const token = issueConfirmToken('secret', claims, 0)
    expect(verifyConfirmToken('secret', token, claims, 5 * 60 * 1000).ok).toBe(false)
  })
})
