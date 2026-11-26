import { completeWithCloudflare, runQuoteAgent, type ModelMessage } from '@schuco/ai-quote-agent'
import { streamSSE } from 'hono/streaming'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requirePermission } from '../middleware/auth'
import { createChatState, quoteIdOf, runQuoteChatTools } from '../services/quote-chat-service'

const bodySchema = z.object({
  quoteId: z.string().uuid().optional(),
  baseRevision: z.number().int().min(1).optional(),
  document: z.unknown().optional(),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
})

export const quoteChat = new Hono<{ Variables: AuthVariables }>()

/** Streams a quote-assistant turn. The conversation is not stored. */
quoteChat.post('/', requireAuth, requirePermission('quote.edit'), async (c) => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !apiToken) {
    return c.json({ error: 'Quote chat is not configured.' }, 503)
  }

  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request body' }, 400)

  const ctx = { effectiveCompanyId: c.get('effectiveCompanyId'), isSuperAdmin: c.get('isSuperAdmin') }
  const actor = {
    actorUserId: c.get('actorUserId'),
    actorCompanyId: c.get('user').company.id,
    requestId: c.get('requestId'),
  }
  const state = createChatState()
  const history: ModelMessage[] = parsed.data.messages.map((message) => ({ role: message.role, content: message.content }))

  return streamSSE(c, async (stream) => {
    const send = async (event: string, data: unknown) => {
      await stream.writeSSE({ event, data: JSON.stringify(data) })
    }
    try {
      await runQuoteAgent({
        messages: history,
        complete: (messages) =>
          completeWithCloudflare(messages, { accountId, apiToken, model: process.env.LLM_MODEL || undefined }),
        execute: async (name, args) => runQuoteChatTools(ctx, actor, parsed.data.quoteId, parsed.data.document, parsed.data.baseRevision, name, args, state),
        emit: async (event) => {
          if (event.type === 'status') await send('status', { tool: event.tool })
          if (event.type === 'text') await send('text', { delta: event.delta })
          if (event.type === 'suggestions') await send('suggestions', { items: event.items })
          if (event.type === 'error') await send('error', { message: event.message })
        },
      })
      const quoteId = quoteIdOf(state)
      if (quoteId) await send('quote', { quoteId })
    } catch (error) {
      await send('error', { message: error instanceof Error ? error.message : 'The assistant failed.' })
    }
    await send('done', {})
  })
})
