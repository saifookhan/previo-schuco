import { describe, expect, it } from 'vitest'

import { plainReply, runQuoteAgent } from './loop'
import type { AgentEvent, ModelMessage, ModelTurn } from './types'

describe('plainReply', () => {
  it('removes the asterisks around a label', () => {
    expect(plainReply('- **Name:** Cassonetto\n- **VAT:** 4%')).toBe('- Name: Cassonetto\n- VAT: 4%')
  })
})

describe('runQuoteAgent', () => {
  it('runs a tool, then streams the final reply and its chips', async () => {
    const events: AgentEvent[] = []
    const seen: ModelMessage[][] = []
    const turns: ModelTurn[] = [
      { content: null, toolCalls: [{ id: 'call-1', name: 'search_catalog', arguments: '{"query":"cassonetto"}' }] },
      { content: 'Due famiglie. Quale vuoi?', toolCalls: [] },
    ]

    await runQuoteAgent({
      messages: [{ role: 'user', content: 'cassonetto' }],
      complete: async (messages) => {
        seen.push(messages)
        return turns.shift()!
      },
      execute: async (name, args) => {
        expect(name).toBe('search_catalog')
        expect(args).toEqual({ query: 'cassonetto' })
        return { content: 'two families', suggestions: [{ label: 'v3', message: 'Usa v3' }] }
      },
      emit: (event) => {
        events.push(event)
      },
    })

    expect(seen[0]?.[0]).toMatchObject({ role: 'system' })
    expect(events.map((event) => event.type)).toEqual(['status', 'text', 'text', 'suggestions'])
    expect(events.filter((event) => event.type === 'text').map((event) => (event.type === 'text' ? event.delta : '')).join('')).toBe(
      'Due famiglie. Quale vuoi?',
    )
  })

  it('asks again when the model claims it has no tools', async () => {
    const events: AgentEvent[] = []
    const turns: ModelTurn[] = [
      { content: "I'm sorry, but I currently don't have the tools to provide that information.", toolCalls: [] },
      { content: null, toolCalls: [{ id: 'call-1', name: 'catalog_summary', arguments: '{}' }] },
      { content: 'Hai 4 famiglie correnti e 22 prodotti.', toolCalls: [] },
    ]

    await runQuoteAgent({
      messages: [{ role: 'user', content: 'Quanti prodotti ci sono?' }],
      complete: async () => turns.shift()!,
      execute: async () => ({ content: '4 current families, 22 lines' }),
      emit: (event) => {
        events.push(event)
      },
    })

    expect(events.some((event) => event.type === 'status' && event.tool === 'catalog_summary')).toBe(true)
    expect(events.filter((event) => event.type === 'text').map((event) => (event.type === 'text' ? event.delta : '')).join('')).toBe(
      'Hai 4 famiglie correnti e 22 prodotti.',
    )
  })

  it('asks again when the model refuses to add an activity', async () => {
    const events: AgentEvent[] = []
    const turns: ModelTurn[] = [
      { content: "I'm sorry, but I currently don't have the tools needed to assist with adding activities.", toolCalls: [] },
      { content: null, toolCalls: [{ id: 'call-1', name: 'add_activity', arguments: '{"description":"saif testing","included":true}' }] },
      { content: 'Ho aggiunto "saif testing" tra le incluse.', toolCalls: [] },
    ]

    await runQuoteAgent({
      messages: [{ role: 'user', content: 'add acitivities: saif testing in included' }],
      complete: async () => turns.shift()!,
      execute: async (name, args) => {
        expect(name).toBe('add_activity')
        expect(args).toEqual({ description: 'saif testing', included: true })
        return { content: 'Added activity "saif testing" (included, printed).' }
      },
      emit: (event) => {
        events.push(event)
      },
    })

    expect(events.some((event) => event.type === 'status' && event.tool === 'add_activity')).toBe(true)
    expect(events.filter((event) => event.type === 'text').map((event) => (event.type === 'text' ? event.delta : '')).join('')).toContain('saif testing')
  })

  it('asks again when the model refuses to change a quantity', async () => {
    const events: AgentEvent[] = []
    const turns: ModelTurn[] = [
      {
        content: "I'm sorry, but I currently don't have the ability to make that change for you, as I don't have access to the necessary tools.",
        toolCalls: [],
      },
      { content: null, toolCalls: [{ id: 'call-1', name: 'update_line', arguments: '{"lineName":"pos 1","quantity":500}' }] },
      { content: 'Pos 1 ora ha quantità 500.', toolCalls: [] },
    ]

    await runQuoteAgent({
      messages: [{ role: 'user', content: 'change the qty for pos 1 to 500' }],
      complete: async () => turns.shift()!,
      execute: async (name, args) => {
        expect(name).toBe('update_line')
        expect(args).toEqual({ lineName: 'pos 1', quantity: 500 })
        return { content: 'Updated pos 1 quantity 500' }
      },
      emit: (event) => {
        events.push(event)
      },
    })

    expect(events.some((event) => event.type === 'status' && event.tool === 'update_line')).toBe(true)
    expect(events.filter((event) => event.type === 'text').map((event) => (event.type === 'text' ? event.delta : '')).join('')).toContain('500')
  })

  it('streams a summary without markdown asterisks', async () => {
    const events: AgentEvent[] = []
    await runQuoteAgent({
      messages: [{ role: 'user', content: 'change vat to 4% for first product' }],
      complete: async () => ({ content: '- **Name:** Cassonetto\n- **VAT:** 4%', toolCalls: [] }),
      execute: async () => ({ content: '' }),
      emit: (event) => {
        events.push(event)
      },
    })
    const text = events.filter((event) => event.type === 'text').map((event) => (event.type === 'text' ? event.delta : '')).join('')
    expect(text).toBe('- Name: Cassonetto\n- VAT: 4%')
    expect(text.includes('**')).toBe(false)
  })

  it('asks again when a duplicate of the first row is not copied', async () => {
    const events: AgentEvent[] = []
    const turns: ModelTurn[] = [
      { content: 'I could not find the row "Cassonetto 1000×300".', toolCalls: [] },
      { content: null, toolCalls: [{ id: 'call-1', name: 'duplicate_line', arguments: '{"lineName":"pos 1"}' }] },
      { content: 'Ho duplicato la prima riga.', toolCalls: [] },
    ]
    await runQuoteAgent({
      messages: [{ role: 'user', content: 'make a duplicate for the first one.' }],
      complete: async () => turns.shift()!,
      execute: async (name, args) => {
        expect(name).toBe('duplicate_line')
        expect(args).toEqual({ lineName: 'pos 1' })
        return { content: 'Duplicated pos 1' }
      },
      emit: (event) => {
        events.push(event)
      },
    })
    expect(events.some((event) => event.type === 'status' && event.tool === 'duplicate_line')).toBe(true)
  })

  it('asks again when the model refuses to reorder the first row', async () => {
    const events: AgentEvent[] = []
    const turns: ModelTurn[] = [
      { content: "I'm sorry, but I currently don't have the tools needed to reorder and make the first product the second one.", toolCalls: [] },
      { content: null, toolCalls: [{ id: 'call-1', name: 'move_line', arguments: '{"lineName":"pos 1","direction":"down"}' }] },
      { content: 'Il primo prodotto ora è il secondo.', toolCalls: [] },
    ]
    await runQuoteAgent({
      messages: [{ role: 'user', content: 'can you reorder and make the first product as the second one?' }],
      complete: async () => turns.shift()!,
      execute: async (name, args) => {
        expect(name).toBe('move_line')
        expect(args).toEqual({ lineName: 'pos 1', direction: 'down' })
        return { content: 'Moved pos 1 down' }
      },
      emit: (event) => {
        events.push(event)
      },
    })
    expect(events.some((event) => event.type === 'status' && event.tool === 'move_line')).toBe(true)
  })

  it('asks again when a text module is searched as a product', async () => {
    const events: AgentEvent[] = []
    const turns: ModelTurn[] = [
      { content: 'I found no families that match "text module".', toolCalls: [] },
      { content: null, toolCalls: [{ id: 'call-1', name: 'add_text_module', arguments: '{"text":"saif testing"}' }] },
      { content: 'Ho aggiunto il modulo testo saif testing.', toolCalls: [] },
    ]
    await runQuoteAgent({
      messages: [{ role: 'user', content: 'add a text module, saif testing' }],
      complete: async () => turns.shift()!,
      execute: async (name, args) => {
        expect(name).toBe('add_text_module')
        expect(args).toEqual({ text: 'saif testing' })
        return { content: 'Added a text module to the intro: "saif testing".' }
      },
      emit: (event) => {
        events.push(event)
      },
    })
    expect(events.some((event) => event.type === 'status' && event.tool === 'add_text_module')).toBe(true)
  })

  it('adds a sized row instead of changing the first quantity', async () => {
    const executed: string[] = []
    const turns: ModelTurn[] = [
      { content: null, toolCalls: [{ id: 'call-1', name: 'update_line', arguments: '{"lineName":"pos 1","quantity":500}' }] },
      {
        content: null,
        toolCalls: [{ id: 'call-2', name: 'add_product', arguments: '{"lineName":"profondità 150","widthMm":1200,"heightMm":1400,"quantity":1}' }],
      },
      { content: 'Ho aggiunto la riga.', toolCalls: [] },
    ]
    await runQuoteAgent({
      messages: [{ role: 'user', content: 'Aggiungi una riga MyBox Revo Light profondità 150, 1200×1400 mm, quantità 1' }],
      complete: async () => turns.shift()!,
      execute: async (name) => {
        executed.push(name)
        return { content: 'added' }
      },
      emit: () => {},
    })
    expect(executed).toEqual(['add_product'])
  })

  it('uses the chosen family instead of asking for the same line again', async () => {
    const events: AgentEvent[] = []
    const turns: ModelTurn[] = [
      { content: 'Which Cassonetto MyBox Revo Light profondità 80 do you want to add?', toolCalls: [] },
      {
        content: null,
        toolCalls: [
          {
            id: 'call-1',
            name: 'add_product',
            arguments: '{"familyId":"13243902-2aae-498e-9d5a-f769c2edc88a","lineName":"Cassonetto MyBox Revo Light profondità 80","widthMm":1200,"heightMm":1400,"quantity":1}',
          },
        ],
      },
      { content: 'Ho aggiunto la riga.', toolCalls: [] },
    ]
    await runQuoteAgent({
      messages: [
        {
          role: 'user',
          content: 'Aggiungi "Cassonetto MyBox Revo Light profondità 80" della famiglia "ali - Cassonetto Coibentato MyBox Revo", id 13243902-2aae-498e-9d5a-f769c2edc88a',
        },
      ],
      complete: async () => turns.shift()!,
      execute: async (name) => {
        expect(name).toBe('add_product')
        return { content: 'added' }
      },
      emit: (event) => {
        events.push(event)
      },
    })
    expect(events.some((event) => event.type === 'status' && event.tool === 'add_product')).toBe(true)
    expect(events.filter((event) => event.type === 'text').map((event) => (event.type === 'text' ? event.delta : '')).join('')).toContain('riga')
  })
})