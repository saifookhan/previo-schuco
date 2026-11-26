import { SYSTEM_PROMPT } from './prompt'
import { QUOTE_TOOLS } from './tools'
import type { AgentEvent, ModelMessage, ModelTurn, ToolOutcome } from './types'

const MAX_ROUNDS = 8
const TEXT_CHUNK = 24
const REFUSAL =
  /don'?t have (?:the |any )?(?:tools|capability|ability|access)|do not have (?:the |any )?(?:tools|capability|ability|access)|non ho (?:gli strumenti|la capacit|la possibilit|accesso)|cannot assist|can'?t assist|non posso (?:farlo|modificar|cambiar)/i
const SIZE = /\d{2,5}\s*[x×]\s*\d{2,5}/

/** One extra round when the model answers in prose instead of calling a tool it has. */
const nudgeFor = (text: string, latestUser: string, called: ReadonlySet<string>): string | null => {
  if (/\b(qty|q\.?ty|quantit|pezzi|stück|stueck|anzahl)\b/i.test(latestUser) && /\d/.test(latestUser) && !called.has('update_line')) {
    return 'The user asked to change a quantity. Call update_line now. lineName is the Pos, for example "pos 1", or the product name. quantity is the number they gave.'
  }
  if (REFUSAL.test(text)) {
    return 'You do have tools, including add_activity for Included and Not included. Call the tool that matches the request. Do not say you lack tools.'
  }
  if (
    /\b(add|aggiung\w*|hinzuf\w*|inseris\w*|metti)\b/i.test(latestUser) &&
    /activit|attivit|acitivit|leistung/i.test(latestUser) &&
    !called.has('add_activity')
  ) {
    return 'The user asked to add an activity. Call add_activity now with the description and included true for Included or false for Not included. Do not search the catalog.'
  }
  if (SIZE.test(latestUser) && !called.has('add_product')) {
    return 'The user gave a width and a height in millimetres. Call add_product now with those sizes and the family and line already discussed.'
  }
  if (
    /how many|quanti prodott|quante famiglie|cosa c'è nel catalogo|what is in the catalog/i.test(latestUser) &&
    !called.has('catalog_summary') &&
    !called.has('search_catalog')
  ) {
    return 'Call catalog_summary now and answer from its numbers.'
  }
  return null
}

export interface AgentRun {
  messages: ModelMessage[]
  complete: (messages: ModelMessage[]) => Promise<ModelTurn>
  execute: (name: string, args: unknown) => Promise<ToolOutcome>
  emit: (event: AgentEvent) => void | Promise<void>
}

const parseArgs = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return {}
  }
}

/** Run tool rounds, then stream the assistant's final text in small pieces. */
export const runQuoteAgent = async ({ messages, complete, execute, emit }: AgentRun): Promise<void> => {
  const history: ModelMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
  let pendingSuggestions: { label: string; message: string }[] = []
  let nudged = false
  const called = new Set<string>()
  const latestUser = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const turn = await complete(history)
    if (turn.toolCalls.length === 0) {
      const text = turn.content ?? ''
      const nudge = nudged ? null : nudgeFor(text, latestUser, called)
      if (nudge) {
        nudged = true
        history.push({ role: 'assistant', content: text })
        history.push({ role: 'user', content: nudge })
        continue
      }
      for (let index = 0; index < text.length; index += TEXT_CHUNK) {
        await emit({ type: 'text', delta: text.slice(index, index + TEXT_CHUNK) })
      }
      if (pendingSuggestions.length > 0) await emit({ type: 'suggestions', items: pendingSuggestions })
      return
    }

    history.push({ role: 'assistant', content: turn.content, toolCalls: turn.toolCalls })
    pendingSuggestions = []
    for (const call of turn.toolCalls) {
      called.add(call.name)
      await emit({ type: 'status', tool: call.name })
      const outcome = await execute(call.name, parseArgs(call.arguments))
      if (outcome.suggestions?.length) pendingSuggestions = outcome.suggestions
      history.push({ role: 'tool', content: outcome.content, toolCallId: call.id })
    }
  }

  await emit({ type: 'error', message: 'Too many steps. Say what to do next.' })
}

export { QUOTE_TOOLS }
