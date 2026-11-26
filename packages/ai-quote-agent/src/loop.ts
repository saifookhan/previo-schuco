import { SYSTEM_PROMPT } from './prompt'
import { QUOTE_TOOLS } from './tools'
import type { AgentEvent, ModelMessage, ModelTurn, ToolOutcome } from './types'

const MAX_ROUNDS = 8
const TEXT_CHUNK = 24

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

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const turn = await complete(history)
    if (turn.toolCalls.length === 0) {
      const text = turn.content ?? ''
      for (let index = 0; index < text.length; index += TEXT_CHUNK) {
        await emit({ type: 'text', delta: text.slice(index, index + TEXT_CHUNK) })
      }
      if (pendingSuggestions.length > 0) await emit({ type: 'suggestions', items: pendingSuggestions })
      return
    }

    history.push({ role: 'assistant', content: turn.content, toolCalls: turn.toolCalls })
    pendingSuggestions = []
    for (const call of turn.toolCalls) {
      await emit({ type: 'status', tool: call.name })
      const outcome = await execute(call.name, parseArgs(call.arguments))
      if (outcome.suggestions?.length) pendingSuggestions = outcome.suggestions
      history.push({ role: 'tool', content: outcome.content, toolCallId: call.id })
    }
  }

  await emit({ type: 'error', message: 'Too many steps. Say what to do next.' })
}

export { QUOTE_TOOLS }
