import { describe, expect, it } from 'vitest'

import { runQuoteAgent } from './loop'
import type { AgentEvent, ModelMessage, ModelTurn } from './types'

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
})