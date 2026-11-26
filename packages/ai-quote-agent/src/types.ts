export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  toolCallId?: string
  toolCalls?: ToolCall[]
}

export interface ModelTurn {
  content: string | null
  toolCalls: ToolCall[]
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** A chip click runs this tool directly. The model is not asked again. */
export interface SuggestionAction {
  tool: string
  args: Record<string, unknown>
}

export interface Suggestion {
  label: string
  message: string
  action?: SuggestionAction
}

export type AgentEvent =
  | { type: 'status'; tool: string }
  | { type: 'text'; delta: string }
  | { type: 'suggestions'; items: Suggestion[] }
  | { type: 'quote'; quoteId: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

export interface ToolOutcome {
  /** Shown back to the model. Keep it short. */
  content: string
  /** Chips the user can click. The label is short; the action runs without the model. */
  suggestions?: Suggestion[]
  /** User-facing reply. When set, it is streamed as-is and the model does not rephrase it. */
  speak?: string
}
