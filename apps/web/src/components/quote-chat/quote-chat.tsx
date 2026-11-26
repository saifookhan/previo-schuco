'use client'

import { MessageSquare, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useEffect, useState } from 'react'

import { useAuth } from '@/hooks/use-auth'
import type { QuoteDocument } from '@schuco/contracts'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface SuggestionAction {
  tool: string
  args: Record<string, unknown>
}

interface Suggestion {
  label: string
  message: string
  action?: SuggestionAction
}

interface QuoteChatProps {
  quoteId?: string
  /** The editor's unsaved document, so a chat save does not drop those edits. */
  document?: QuoteDocument
  baseRevision?: number
  /** Called with the quote the turn saved. The list page navigates; the editor reloads. */
  onQuote?: (quoteId: string) => void | Promise<void>
}

const WELCOME_ACTIONS = ['create', 'catalog', 'add', 'edit', 'arrange', 'extras', 'header', 'preview'] as const

const TOOLS = [
  'catalog_summary',
  'search_catalog',
  'describe_family',
  'create_quote',
  'add_product',
  'duplicate_line',
  'duplicate_family',
  'move_line',
  'add_text_module',
  'add_activity',
  'update_line',
  'get_quote',
  'update_header',
  'update_lines',
  'set_line_options',
  'remove_line',
  'remove_family',
  'move_family',
  'update_family_block',
  'switch_family_version',
  'edit_text_module',
  'remove_text_module',
  'insert_text_template',
  'remove_activity',
  'set_payments',
  'set_quote_status',
  'save_new_version',
  'restore_revision',
  'update_print_settings',
  'preview_pdf',
  'duplicate_quote',
  'cancel_action',
] as const

/** Hands the open transcript to the quote page a chat action navigates to. A refresh drops it. */
let carriedChat: { quoteId: string; messages: ChatMessage[]; suggestions: Suggestion[] } | null = null

/** Chat that creates and edits a quote. Messages stay in this panel until it closes. */
export const QuoteChat = ({ quoteId, document, baseRevision, onQuote }: QuoteChatProps) => {
  const t = useTranslations('quoteChat')
  const locale = useLocale()
  const { can } = useAuth()
  const router = useRouter()
  const restored = carriedChat?.quoteId === quoteId ? carriedChat : null
  const [open, setOpen] = useState(Boolean(restored))
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(restored?.messages ?? [])
  const [suggestions, setSuggestions] = useState<Suggestion[]>(restored?.suggestions ?? [])
  const [activity, setActivity] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (carriedChat?.quoteId === quoteId) carriedChat = null
    }, 0)
    return () => window.clearTimeout(timer)
  }, [quoteId])

  if (!can('quote.edit')) return null

  const starters: Suggestion[] = [
    { label: t('starters.newQuoteLabel'), message: t('starters.newQuote') },
    { label: t('starters.countLabel'), message: t('starters.count') },
    { label: t('starters.exampleLabel'), message: t('starters.example') },
  ]
  const chips = messages.length === 0 ? starters : suggestions

  const send = async (text: string, action?: SuggestionAction) => {
    const content = text.trim()
    if (!content || busy) return
    const next = [...messages, { role: 'user' as const, content }]
    const pendingChoices = suggestions
    setMessages(next)
    setDraft('')
    setSuggestions([])
    setError(null)
    setBusy(true)
    setActivity(t('working'))
    let assistant = ''
    let nextSuggestions: Suggestion[] = []
    try {
      const response = await fetch('/api/quote-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, document, baseRevision, messages: next, locale, pendingChoices, action }),
      })
      if (!response.ok || !response.body) {
        setError(t('unavailable'))
        return
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let savedQuoteId: string | null = null
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''
        for (const block of blocks) {
          const event = block.match(/^event: (.*)$/m)?.[1] ?? 'message'
          const data = block.match(/^data: (.*)$/m)?.[1]
          if (!data) continue
          const payload = JSON.parse(data) as {
            tool?: string
            delta?: string
            message?: string
            quoteId?: string
            items?: Suggestion[]
          }
          if (event === 'status' && payload.tool && TOOLS.includes(payload.tool as (typeof TOOLS)[number])) {
            setActivity(t(`tools.${payload.tool as (typeof TOOLS)[number]}`))
          }
          if (event === 'text' && payload.delta) {
            assistant += payload.delta
            const snapshot = assistant
            setMessages([...next, { role: 'assistant', content: snapshot }])
            setActivity(null)
          }
          if (event === 'suggestions' && payload.items) {
            nextSuggestions = payload.items
            setSuggestions(payload.items)
          }
          if (event === 'error' && payload.message) setError(payload.message)
          if (event === 'quote' && payload.quoteId) savedQuoteId = payload.quoteId
        }
      }
      if (savedQuoteId) {
        const transcript = assistant ? [...next, { role: 'assistant' as const, content: assistant }] : next
        if (savedQuoteId !== quoteId) carriedChat = { quoteId: savedQuoteId, messages: transcript, suggestions: nextSuggestions }
        if (onQuote) await onQuote(savedQuoteId)
        else if (!quoteId) router.push(`/app/quotes/${savedQuoteId}`)
      }
    } catch {
      setError(t('unavailable'))
      if (quoteId && onQuote) await onQuote(quoteId)
    } finally {
      setBusy(false)
      setActivity(null)
    }
  }

  return (
    <div className="fixed bottom-24 right-6 z-40 flex flex-col items-end gap-3">
      {open ? (
        <section className="flex h-[min(40rem,calc(100dvh-7.5rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">{t('title')}</h2>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label={t('close')}>
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <div className="mr-6 rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-800">
                <p>{t('welcome')}</p>
                <ul className="mt-2 list-disc space-y-0.5 pl-4 leading-snug">
                  {WELCOME_ACTIONS.map((action) => (
                    <li key={action}>{t(`actions.${action}`)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {messages.map((message, index) => (
              <p
                key={`${message.role}-${index}`}
                className={
                  message.role === 'user'
                    ? 'ml-8 whitespace-pre-wrap rounded-2xl bg-slate-900 px-3 py-2 text-sm text-white'
                    : 'mr-6 whitespace-pre-wrap rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-800'
                }
              >
                {message.content}
              </p>
            ))}
            {activity ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand" />
                {activity}
              </p>
            ) : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
          {chips.length > 0 && !busy ? (
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {chips.map((chip) => (
                <button
                  key={`${chip.label}-${chip.message}`}
                  type="button"
                  onClick={() => void send(chip.message, chip.action)}
                  className="max-w-full whitespace-normal rounded-full border border-slate-200 px-3 py-1 text-left text-xs leading-snug text-slate-700 hover:border-slate-400"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}
          <form
            className="flex gap-2 border-t border-slate-100 p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void send(draft)
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('placeholder')}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
            <button type="submit" disabled={busy || !draft.trim()} className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-40">
              {t('send')}
            </button>
          </form>
        </section>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-lg"
        aria-label={t('open')}
      >
        <MessageSquare className="h-5 w-5" />
      </button>
    </div>
  )
}
