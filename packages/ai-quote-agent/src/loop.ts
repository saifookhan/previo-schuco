import { hasSize, isEditRequest, isNewQuoteRequest, isNewRowRequest, isRemoving } from './intent'
import { SYSTEM_PROMPT, TOOL_NAMES } from './prompt'
import { QUOTE_TOOLS } from './tools'
import type { AgentEvent, ModelMessage, ModelTurn, Suggestion, ToolOutcome } from './types'

const MAX_ROUNDS = 8
const TEXT_CHUNK = 24
const REFUSAL =
  /don'?t have (?:the |any )?(?:necessary |required )?(?:tools|capability|ability|access)|do not have (?:the |any )?(?:necessary |required )?(?:tools|capability|ability|access)|non ho (?:gli strumenti|la capacit|la possibilit|accesso)|cannot assist|can'?t assist|non posso (?:farlo|modificar|cambiar)|i cannot reorder|can'?t reorder|non posso riordin/i
const FAMILY_ID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i
const TOOL_LIST = TOOL_NAMES.join(', ')

/** "Aggiungi una riga …, quantità 1" is a new row, not a change to an existing quantity. */
const addingNewRow = (message: string): boolean => isNewRowRequest(message) && hasSize(message) && !/\b(aggiung\w*|add)\s+["“]/i.test(message)

/** One extra round when the model answers in prose instead of calling a tool it has. */
const nudgeFor = (text: string, latestUser: string, called: ReadonlySet<string>): string | null => {
  if (isRemoving(latestUser) && !called.has('remove_line') && !called.has('remove_family') && !called.has('remove_activity') && !called.has('remove_text_module')) {
    return 'The user asked to remove something. Call remove_line, remove_family, remove_activity, or remove_text_module. Do not add a row, an activity, or a text module.'
  }
  if (/nota interna|internal note|interne notiz/i.test(latestUser) && !called.has('update_header')) {
    return 'The user asked for an internal note. Call update_header with notes. Do not add a printed text module.'
  }
  if (/\b(pagament\w*|payment|anzahlung|acconto|saldo)\b/i.test(latestUser) && !called.has('set_payments')) {
    return 'The user asked to change payments. Call set_payments. Do not call add_activity.'
  }
  if (/\b(e-?mail|email)\b/i.test(latestUser)) {
    return 'Sending a quote by email is not available. Say that in the user language. Do not call add_activity.'
  }
  if (/\b(template|testo salvato|saved text|textbaustein)\b/i.test(latestUser) && !called.has('insert_text_template')) {
    return 'The user asked for a saved text template. Call insert_text_template with the template name. Do not type that name as a new module.'
  }
  if (/\b(text module|modulo testo|textmodul)\b/i.test(latestUser) && !isRemoving(latestUser) && !called.has('add_text_module')) {
    return 'The user asked for a text module, not a catalog family. Call add_text_module now with the text they gave. Do not search the catalog.'
  }
  if (isNewQuoteRequest(latestUser) && !called.has('create_quote')) {
    return 'The user asked for a new quote. Call create_quote with the customer name.'
  }
  if (
    /\b(first|prima|primo|erste)\b/i.test(latestUser) &&
    /\b(second|secondo|zweite)\b/i.test(latestUser) &&
    !called.has('move_line')
  ) {
    return 'The user wants the first product to become the second. Call move_line now with lineName "pos 1" and direction "down".'
  }
  if (/\b(duplic\w*|kopier\w*|copy)\b/i.test(latestUser) && /\b(questo preventivo|this quote|the quote|das angebot)\b/i.test(latestUser) && !called.has('duplicate_quote')) {
    return 'The user asked to copy the quote. Call duplicate_quote with the new customer name. Do not call create_quote.'
  }
  if (/\b(duplic\w*|kopier\w*|copy)\b/i.test(latestUser) && /\b(first|prima|primo|erste)\b/i.test(latestUser) && !called.has('duplicate_line')) {
    return 'The user asked to duplicate the first row. Call duplicate_line now with lineName "pos 1".'
  }
  if (addingNewRow(latestUser) && !called.has('add_product')) {
    return 'The user asked to add a new catalog row, including a quantity for that new row. Call add_product with the line name, width, height, and quantity. Do not call update_line. Do not invent a size.'
  }
  if (FAMILY_ID.test(latestUser) && /\b(aggiung\w*|della famiglia)\b/i.test(latestUser) && !called.has('add_product')) {
    return 'The user chose one family. Call add_product now with that familyId and the line name. Use the width and height the user typed. Do not search again and do not invent a size.'
  }
  if (/\b(aggiung\w*|add)\s+["“]/i.test(latestUser) && !called.has('add_product')) {
    return 'The user picked one product line. Call add_product with that exact line name and the width and height the user typed. Do not call search_catalog and do not ask the same question again.'
  }
  if (/\b(tutte le righe|all rows|whole quote|intero preventivo)\b/i.test(latestUser) && !called.has('update_lines')) {
    return 'This changes every row. Call update_lines with scope "all". Do not search the catalog.'
  }
  if (isEditRequest(latestUser) && !called.has('update_line') && !called.has('update_lines') && !called.has('set_line_options')) {
    return 'This edits a row already on the quote. Call update_line, update_lines, or set_line_options. Do not call search_catalog or add_product.'
  }
  if (
    /\b(qty|q\.?ty|quantit|pezzi|stück|stueck|anzahl)\b/i.test(latestUser) &&
    /\d/.test(latestUser) &&
    !addingNewRow(latestUser) &&
    !called.has('update_line')
  ) {
    return 'The user asked to change a quantity. Call update_line now. lineName is the Pos, for example "pos 1", or the product name. quantity is the number they gave.'
  }
  if (REFUSAL.test(text)) {
    return `You do have these tools: ${TOOL_LIST}. Call the one that matches. Do not say you lack tools.`
  }
  if (
    /\b(add|aggiung\w*|hinzuf\w*|inseris\w*|metti)\b/i.test(latestUser) &&
    /activit|attivit|acitivit|leistung/i.test(latestUser) &&
    !isRemoving(latestUser) &&
    !called.has('add_activity')
  ) {
    return 'The user asked to add an activity. Call add_activity now with the description and included true for Included or false for Not included. Do not search the catalog.'
  }
  if (/\bpdf\b|anteprima di stampa|print preview/i.test(latestUser) && !called.has('preview_pdf')) {
    return 'The user asked for the PDF. Call preview_pdf.'
  }
  if (/\b(inviato|accepted|accettat\w*|rifiutat\w*|rejected|mark(?:ed)? as sent)\b/i.test(latestUser) && !called.has('set_quote_status')) {
    return 'The user asked to change the quote status. Call set_quote_status.'
  }
  if (hasSize(latestUser) && !isEditRequest(latestUser) && !called.has('add_product')) {
    return 'The user gave a width and a height in millimetres. Call add_product with those sizes and the family and line already discussed. Do not invent a different size.'
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
  /** Quote summary and "Reply in Italian" for this turn. */
  preamble?: string
  complete: (messages: ModelMessage[]) => Promise<ModelTurn>
  execute: (name: string, args: unknown) => Promise<ToolOutcome>
  emit: (event: AgentEvent) => void | Promise<void>
}

/** The panel shows plain text, so markdown emphasis would appear as asterisks. */
export const plainReply = (text: string): string => text.replace(/\*\*/g, '').replace(/__/g, '')

const parseArgs = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return {}
  }
}

/** Run tool rounds, then stream the assistant's final text in small pieces. */
const streamText = async (emit: AgentRun['emit'], text: string): Promise<void> => {
  const plain = plainReply(text)
  for (let index = 0; index < plain.length; index += TEXT_CHUNK) {
    await emit({ type: 'text', delta: plain.slice(index, index + TEXT_CHUNK) })
  }
}

const blockedCall = (name: string, latestUser: string, pending: Suggestion[]): string | null => {
  if (name === 'update_line' && addingNewRow(latestUser)) {
    return 'The user asked to add a new row. Call add_product with the line name, width, height, and quantity. Do not change an existing row.'
  }
  if (isEditRequest(latestUser) && (name === 'search_catalog' || name === 'add_product' || name === 'create_quote')) {
    return 'This edits a row on the open quote. Call update_line or update_lines. Do not search the catalog and do not add a product.'
  }
  if (isEditRequest(latestUser) && name === 'add_activity' && !/activit|attivit|leistung/i.test(latestUser)) {
    return 'This changes a row, not an activity. Call update_line.'
  }
  if (/\b(e-?mail|email)\b/i.test(latestUser) && (name === 'add_activity' || name === 'add_text_module')) {
    return 'Sending a quote by email is not available. Do not add an activity or a text module.'
  }
  if (isRemoving(latestUser) && (name === 'add_activity' || name === 'add_text_module' || name === 'add_product')) {
    return 'The user asked to remove something. Call remove_line, remove_family, remove_activity, or remove_text_module.'
  }
  if (/nota interna|internal note|interne notiz/i.test(latestUser) && name === 'add_text_module') {
    return 'An internal note uses update_header notes. Do not add a printed module.'
  }
  if (/\b(pagament\w*|payment|acconto|saldo)\b/i.test(latestUser) && name === 'add_activity') {
    return 'Payments use set_payments. Do not add an activity.'
  }
  if (pending.length > 0 && (name === 'add_product' || name === 'create_quote')) {
    return 'Choices are waiting. Do not add a product or create a quote until the user picks one.'
  }
  return null
}

/** Run tool rounds, then stream the assistant's final text in small pieces. */
export const runQuoteAgent = async ({ messages, preamble, complete, execute, emit }: AgentRun): Promise<void> => {
  const history: ModelMessage[] = [{ role: 'system', content: preamble ? `${SYSTEM_PROMPT}\n${preamble}` : SYSTEM_PROMPT }, ...messages]
  let pendingSuggestions: Suggestion[] = []
  let nudged = false
  const called = new Set<string>()
  const latestUser = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const turn = await complete(history)
    if (turn.toolCalls.length === 0) {
      const text = plainReply(turn.content ?? '')
      const nudge = nudged ? null : nudgeFor(text, latestUser, called)
      if (nudge) {
        nudged = true
        history.push({ role: 'assistant', content: text })
        history.push({ role: 'user', content: nudge })
        continue
      }
      await streamText(emit, text)
      if (pendingSuggestions.length > 0) await emit({ type: 'suggestions', items: pendingSuggestions })
      return
    }

    history.push({ role: 'assistant', content: turn.content, toolCalls: turn.toolCalls })
    pendingSuggestions = []
    const spoken: string[] = []
    for (const call of turn.toolCalls) {
      const blocked = blockedCall(call.name, latestUser, pendingSuggestions)
      if (blocked) {
        history.push({ role: 'tool', content: blocked, toolCallId: call.id })
        continue
      }
      called.add(call.name)
      await emit({ type: 'status', tool: call.name })
      const outcome = await execute(call.name, parseArgs(call.arguments))
      if (outcome.suggestions?.length) pendingSuggestions = outcome.suggestions
      if (outcome.speak) spoken.push(outcome.speak)
      history.push({ role: 'tool', content: outcome.content, toolCallId: call.id })
    }
    if (spoken.length > 0) {
      await streamText(emit, spoken.join('\n'))
      if (pendingSuggestions.length > 0) await emit({ type: 'suggestions', items: pendingSuggestions })
      return
    }
  }

  if (pendingSuggestions.length > 0) {
    await emit({ type: 'suggestions', items: pendingSuggestions })
    return
  }
  await emit({ type: 'text', delta: 'Which step should I take?' })
}

export { QUOTE_TOOLS }
