import { QUOTE_TOOLS } from './tools'
import type { ModelMessage, ModelTurn, ToolCall } from './types'

const DEFAULT_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct'

interface CloudflareChoice {
  message?: {
    content?: string | null
    tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: unknown } }>
  }
}

/** One non-streaming Workers AI chat completion. Tool calls come back whole. */
export const completeWithCloudflare = async (
  messages: ModelMessage[],
  credentials: { accountId: string; apiToken: string; model?: string },
): Promise<ModelTurn> => {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/ai/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: credentials.model ?? DEFAULT_MODEL,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
          tool_call_id: message.toolCallId,
          tool_calls: message.toolCalls?.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: call.arguments },
          })),
        })),
        tools: QUOTE_TOOLS.map((tool) => ({
          type: 'function',
          function: { name: tool.name, description: tool.description, parameters: tool.parameters },
        })),
        tool_choice: 'auto',
        max_tokens: 1200,
      }),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Cloudflare Workers AI failed (${response.status}): ${detail.slice(0, 300)}`)
  }

  const body = (await response.json()) as { choices?: CloudflareChoice[] }
  const message = body.choices?.[0]?.message
  const toolCalls: ToolCall[] = (message?.tool_calls ?? [])
    .filter((call) => call.function?.name)
    .map((call) => ({
      id: call.id,
      name: call.function?.name ?? '',
      arguments:
        typeof call.function?.arguments === 'string'
          ? call.function.arguments
          : JSON.stringify(call.function?.arguments ?? {}),
    }))

  return { content: message?.content ?? null, toolCalls }
}
