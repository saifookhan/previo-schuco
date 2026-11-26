import { describe, expect, it } from 'vitest'

import { issueConfirmToken, removeTokenAllows, verifyConfirmToken } from './confirm'
import { catalogQuery } from './match'
import {
  choiceIndex,
  detectLanguage,
  isEditRequest,
  isNewQuoteRequest,
  namedTarget,
  resolveDirectAction,
  sizeForTurn,
  sizeOnly,
  sizesIn,
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
    const pendingChoices = [
      {
        label: 'pos 1 · a1b2 · Confezione 30',
        message: 'add_product id l-1',
        action: { tool: 'add_product', args: { lineName: 'Confezione 30 Filtri', familyId: '13243902-2aae-498e-9d5a-f769c2edc88a', widthMm: 2000, heightMm: 2000 } },
      },
      {
        label: 'pos 2 · c3d4 · Confezione 10',
        message: 'add_product id l-2',
        action: { tool: 'add_product', args: { lineName: 'Confezione 10 Filtri', familyId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } },
      },
    ]
    for (const latestUser of ['1', 'the first', 'la prima']) {
      expect(resolveDirectAction({ latestUser, pendingChoices })).toEqual(pendingChoices[0]?.action)
    }
  })

  it('keeps a chosen line when the next message is only the size', () => {
    const action = resolveDirectAction({
      latestUser: '2500x500',
      pendingChoices: [
        { label: 'size', message: 'size', action: { tool: 'add_product', args: { lineName: 'Confezione 30', familyId: 'fam-1' } } },
      ],
    })
    expect(action).toEqual({ tool: 'add_product', args: { lineName: 'Confezione 30', familyId: 'fam-1', widthMm: 2500, heightMm: 500 } })
  })
})

describe('sizes', () => {
  const forms = ['2500x500', '2500 x 500', '2500X500', '2500×500', '2500*500', '2500 per 500', '2500 by 500', '2500x500 mm', '2500 mm x 500 mm']

  it('reads every common width and height form', () => {
    for (const form of forms) {
      expect(sizesIn(form)).toEqual([{ widthMm: 2500, heightMm: 500 }])
      expect(sizeOnly(form)).toEqual({ widthMm: 2500, heightMm: 500 })
    }
    expect(sizeOnly('2500x500')).toEqual({ widthMm: 2500, heightMm: 500 })
    expect(sizeOnly('2500 per 500 mm')).toEqual({ widthMm: 2500, heightMm: 500 })
    expect(sizeOnly('2500 by 500')).toEqual({ widthMm: 2500, heightMm: 500 })
    expect(sizesIn('aggiungi confezione 2000x2000')).toEqual([{ widthMm: 2000, heightMm: 2000 }])
    expect(sizesIn('cambia la misura a 2500*500 mm')).toEqual([{ widthMm: 2500, heightMm: 500 }])
  })

  it('uses the same parser for the user-typed check and for a missing tool size', () => {
    expect(userGaveSize(['confezione 2000x2000'], 2000, 2000)).toBe(true)
    expect(userGaveSize(['confezione 2000x2000'], 1200, 1400)).toBe(false)
    expect(userGaveSize(['2500*500'], 2500, 500)).toBe(true)
    expect(sizeForTurn(['aggiungi confezione 2500x500'], undefined, undefined)).toEqual({ widthMm: 2500, heightMm: 500 })
    expect(sizeForTurn(['aggiungi confezione 2500x500'], 1200, 1400)).toBeUndefined()
    expect(sizeForTurn(['aggiungi confezione 2500x500'], '1200x1400', undefined)).toBeUndefined()
    expect(sizeForTurn(['cambia la misura della riga a 2500 per 500'], undefined, undefined)).toEqual({ widthMm: 2500, heightMm: 500 })
    expect(catalogQuery('aggiungi confezione 2000x2000')).toBe('confezione')
  })
})

describe('named rows', () => {
  it('keeps the product the user named', () => {
    expect(namedTarget('sconto 10% sulla Macchina VMC')).toBe('Macchina VMC')
    expect(namedTarget('metti IVA 10% sulla riga Macchina VMC')).toBe('Macchina VMC')
    expect(namedTarget('elimina la riga pos 2')).toMatch(/pos 2/i)
    expect(namedTarget('set VAT exempt on all rows')).toBeNull()
  })
})

describe('language and catalog query', () => {
  it('detects Italian, English, and German', () => {
    expect(detectLanguage('metti IVA sulla riga', 'en')).toBe('it')
    expect(detectLanguage('set the price of the row', 'it')).toBe('en')
    expect(detectLanguage('Bitte die Zeile hinzufügen', 'it')).toBe('de')
    expect(detectLanguage('the first', 'it')).toBe('it')
    expect(detectLanguage('1', 'it')).toBe('it')
    expect(detectLanguage('2500x500', 'it')).toBe('it')
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

  it('still allows remove when the chip also carries the family', () => {
    const token = issueConfirmToken('secret', { ...claims, args: { lineName: 'l-1' } }, 1_000)
    expect(removeTokenAllows('secret', token, { quoteId: 'q', lineName: 'l-1' }, 1_000)).toBe(true)
    expect(removeTokenAllows('secret', token, { quoteId: 'q', lineName: 'l-2' }, 1_000)).toBe(false)
  })
})
