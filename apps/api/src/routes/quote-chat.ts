import { detectLanguage, resolveDirectAction, runQuoteAgent, type ChatLocale, type ModelMessage, type Suggestion, type SuggestionAction, completeWithCloudflare } from '@schuco/ai-quote-agent'
import { streamSSE } from 'hono/streaming'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requirePermission } from '../middleware/auth'
import { createChatState, quoteIdOf, quotePreamble, runQuoteChatTools } from '../services/quote-chat-service'

const suggestionSchema = z.object({
  label: z.string().max(200),
  message: z.string().max(2000),
  action: z
    .object({
      tool: z.string().max(80),
      args: z.record(z.string(), z.unknown()),
    })
    .optional(),
})

const bodySchema = z.object({
  quoteId: z.string().uuid().optional(),
  baseRevision: z.number().int().min(1).optional(),
  document: z.unknown().optional(),
  locale: z.enum(['it', 'en', 'de']).optional(),
  pendingChoices: z.array(suggestionSchema).max(12).optional(),
  action: z.object({ tool: z.string().max(80), args: z.record(z.string(), z.unknown()) }).optional(),
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
  const userTexts = parsed.data.messages.filter((message) => message.role === 'user').map((message) => message.content)
  const latestUser = userTexts.at(-1) ?? ''
  const uiLocale: ChatLocale = parsed.data.locale ?? 'it'
  const prior = userTexts.slice(0, -1).join('\n')
  const locale = detectLanguage(latestUser, prior.trim() ? detectLanguage(prior, uiLocale) : uiLocale)
  const state = createChatState({ userTexts, locale })
  const history: ModelMessage[] = parsed.data.messages.map((message) => ({ role: message.role, content: message.content }))
  const direct = resolveDirectAction({
    latestUser,
    pendingChoices: parsed.data.pendingChoices as Suggestion[] | undefined,
    action: parsed.data.action as SuggestionAction | undefined,
  })

  c.header('X-Accel-Buffering', 'no')
  c.header('Cache-Control', 'no-cache, no-transform')
  return streamSSE(c, async (stream) => {
    const keepAlive = setInterval(() => {
      void stream.write(': keepalive\n\n')
    }, 10_000)
    const send = async (event: string, data: unknown) => {
      await stream.writeSSE({ event, data: JSON.stringify(data) })
    }
    const execute = (name: string, args: unknown) =>
      runQuoteChatTools(ctx, actor, parsed.data.quoteId, parsed.data.document, parsed.data.baseRevision, name, args, state)
    try {
      if (direct) {
        await send('status', { tool: direct.tool })
        const outcome = await execute(direct.tool, direct.args)
        const text = outcome.speak ?? outcome.content
        if (text) await send('text', { delta: text })
        if (outcome.suggestions?.length) await send('suggestions', { items: outcome.suggestions })
      } else {
        const preamble = await quotePreamble(ctx, parsed.data.quoteId, locale)
        await runQuoteAgent({
          messages: history,
          preamble,
          complete: (messages) => completeWithCloudflare(messages, { accountId, apiToken, model: process.env.LLM_MODEL || undefined }),
          execute,
          emit: async (event) => {
            if (event.type === 'status') await send('status', { tool: event.tool })
            if (event.type === 'text') await send('text', { delta: event.delta })
            if (event.type === 'suggestions') await send('suggestions', { items: event.items })
            if (event.type === 'error') await send('error', { message: event.message })
          },
        })
      }
      const quoteId = quoteIdOf(state)
      if (quoteId) await send('quote', { quoteId })
    } catch (error) {
      console.error('quote-chat failed', error)
      await send('error', { message: 'The assistant could not finish that step.' })
    } finally {
      clearInterval(keepAlive)
    }
    await send('done', {})
  })
})
