import {
  anotherProductQuery,
  catalogQuery,
  catalogStepSuggestions,
  choiceIndex,
  decideConfirm,
  expandQuery,
  foldName,
  isEditRequest,
  isNewQuoteRequest,
  isNonsenseDump,
  isRemoving,
  isUuid,
  issueConfirmToken,
  mentionedId,
  nameMatches,
  namedTarget,
  percentsSumTo100,
  phrases,
  placeActivity,
  positionQuery,
  quotedName,
  samePosition,
  sizeForTurn,
  sizeIssue,
  sizeOnly,
  sizesIn,
  statedPercents,
  statusWord,
  selectNameMatches,
  wantsHiddenCatalog,
  wantsPreviousRevision,
  wantsUndo,
  withoutSize,
  type ChatLocale,
  type Suggestion,
} from '@schuco/ai-quote-agent'
import {
  lineNetUnitPrice,
  lineTotal,
  priceValidityStatus,
  priceValidityToday,
  quoteDocumentSchema,
  quoteTotal,
  type QuoteDocument,
  type QuoteFamily,
  type QuoteLine,
  type SalesQuoteDetailResponse,
  type VatRate,
} from '@schuco/contracts'

import type { TenantContext } from '../lib/tenant-db'
import { getProductFamilyDetailWithLibrary, listLinesForFamilies, listProductFamilies } from './product-families-service'
import {
  QuoteConflictError,
  QuoteValidationError,
  createQuote,
  getQuote,
  getQuoteRevisionDetail,
  priceQuoteLines,
  saveQuoteVersion,
  setQuoteVersionStatusById,
  type QuoteActor,
} from './quotes-service'
import { listTextTemplates } from './company-profile-service'

const VAT_RATES = ['22%', '10%', '4%', 'Es.'] as const

const localId = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 13)}`

const isQuotable = (family: {
  isPublished: boolean
  inLibrary: boolean
  readyForInvoicing: boolean
  priceValidFrom: string | null
  priceValidTo: string | null
}): boolean =>
  family.isPublished && family.inLibrary && family.readyForInvoicing && priceValidityStatus(family, priceValidityToday()) === 'current'

const validityLabel = (family: { priceValidFrom: string | null; priceValidTo: string | null }): string => {
  const status = priceValidityStatus(family, priceValidityToday())
  const range = [family.priceValidFrom ?? '…', family.priceValidTo ?? '…'].join(' → ')
  return `${status} (${range})`
}

const nextCode = (family: QuoteFamily): string =>
  String(family.lines.reduce((max, line) => Math.max(max, Number(line.code.replace(/\D/g, '')) || 0), 0) + 1)

const summarizeDocument = (document: QuoteDocument): string => {
  const rows = document.families
    .map((family) => {
      const lines = family.lines
        .map((line, index) => {
          const net = lineNetUnitPrice(line)
          const total = lineTotal(line)
          return `  ${index + 1}. pos ${line.code} ${line.name} ${line.widthMm ?? '—'}×${line.heightMm ?? '—'} qty ${line.quantity} €/pc ${line.unitPrice} extra ${line.extraMarkupPct}% disc ${line.discountPct}% net ${net.toFixed(2)} total ${total.toFixed(2)} VAT ${line.vatRate} h ${line.installationHours ?? '—'} [${line.id}]`
        })
        .join('\n')
      return `${family.name} [${family.id}]\n${lines || '  (no rows)'}`
    })
    .join('\n')
  const textPreview = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  const modules = document.intro.map((module, index) => `  ${index + 1}. ${textPreview(module.html) || '(empty)'}`).join('\n')
  const activities = document.closing
    .filter((block) => block.type === 'activities')
    .flatMap((block) => block.rows)
    .map((row) => `  ${row.description} | ${row.included ? 'included' : 'not included'} | ${row.enabled ? 'printed' : 'not printed'}`)
    .join('\n')
  return `${rows || '(no products)'}\nText modules:\n${modules || '  (none)'}\nActivities:\n${activities || '  (none)'}\nQuote total ex VAT ${quoteTotal(document).toFixed(2)}`
}

const findLines = (document: QuoteDocument, query: string): { family: QuoteFamily; line: QuoteLine }[] => {
  const rows = document.families.flatMap((family) => family.lines.map((line) => ({ family, line })))
  const embeddedId = query.match(/\bl-[0-9a-f-]{8,}/i)?.[0]
  const byId = rows.filter(({ line }) => line.id === query || line.id === embeddedId)
  if (byId.length > 0) return byId
  const scoped = query.match(/famigl\w*\s+(\d+)\s+pos(?:izione)?\s+(\d+)/i)
  if (scoped) {
    const family = document.families[Number(scoped[1]) - 1]
    const line = family?.lines.find((item) => samePosition(item.code, scoped[2] ?? ''))
    return family && line ? [{ family, line }] : []
  }
  const globalIndex = query.match(/^(?:riga|row|zeile)\s+(\d+)$/i)
  if (globalIndex) {
    const hit = rows[Number(globalIndex[1]) - 1]
    return hit ? [hit] : []
  }
  if (positionQuery(query)) {
    const byPos = rows.filter(({ line }) => samePosition(line.code, query))
    if (byPos.length > 0) return byPos
  }
  const named = withoutSize(quotedName(query) ?? query)
  if (!named) return []
  return rows.filter(({ line }) => nameMatches(line.name, named) || nameMatches(line.code, named))
}

const findFamilies = (document: QuoteDocument, query: string): QuoteFamily[] => {
  const index = query.match(/famigl\w*\s+(\d+)/i)
  if (index && !/pos/i.test(query)) {
    const family = document.families[Number(index[1]) - 1]
    return family ? [family] : []
  }
  return document.families.filter((family) => nameMatches(family.name, query) || family.id === query)
}

/** Version, validity, and a short id stay at the start so a narrow chip still shows which one. */
const chipLabel = (badge: string, name: string): string => {
  const head = badge.trim()
  const tail = name.trim()
  if (!tail) return head.slice(0, 90)
  const room = Math.max(16, 90 - head.length - 3)
  return `${head} · ${tail.slice(0, room)}`
}

const rowChoices = (tool: string, hits: { family: QuoteFamily; line: QuoteLine }[], extra: Record<string, unknown> = {}): Suggestion[] => {
  const seen = new Set<string>()
  return hits.slice(0, 8).flatMap(({ family, line }) => {
    const message = `${tool} id ${line.id}`
    if (seen.has(message)) return []
    seen.add(message)
    return [
      {
        label: chipLabel(`pos ${line.code} · ${line.id.slice(-4)}`, line.name),
        message,
        action: { tool, args: { ...extra, lineName: line.id, familyName: family.id } },
      },
    ]
  })
}

/** A name the user typed, matched as a phrase. Fuzzy leftovers are not "real matches". */
const phraseLines = (document: QuoteDocument, subject: string): { family: QuoteFamily; line: QuoteLine }[] => {
  if (positionQuery(subject)) return findLines(document, subject)
  const folded = foldName(subject)
  if (!folded) return []
  const rows = document.families.flatMap((family) => family.lines.map((line) => ({ family, line })))
  const exact = rows.filter(({ line }) => foldName(line.name) === folded || line.id === subject)
  if (exact.length > 0) return exact
  const tokens = folded.split(' ').filter((token) => token.length > 2)
  if (tokens.length === 0) return []
  return rows.filter(({ line }) => {
    const name = foldName(line.name)
    return tokens.every((token) => name.includes(token))
  })
}

const phraseFamilies = (document: QuoteDocument, subject: string): QuoteFamily[] => {
  const folded = foldName(subject)
  if (!folded) return []
  const exact = document.families.filter((family) => foldName(family.name) === folded || family.id === subject)
  if (exact.length > 0) return exact
  const tokens = folded.split(' ').filter((token) => token.length > 2)
  if (tokens.length === 0) return []
  return document.families.filter((family) => {
    const name = foldName(family.name)
    return tokens.every((token) => name.includes(token))
  })
}

const matrixBounds = (detail: { matrices: { id: string; widths: unknown; heights: unknown }[] }, matrixId?: string | null): string => {
  const chosen = matrixId ? detail.matrices.filter((matrix) => matrix.id === matrixId) : detail.matrices
  const parts = chosen
    .map((matrix) => {
      const widths = Array.isArray(matrix.widths) ? matrix.widths.filter((item): item is number => typeof item === 'number') : []
      const heights = Array.isArray(matrix.heights) ? matrix.heights.filter((item): item is number => typeof item === 'number') : []
      if (!widths.length || !heights.length) return null
      return `width ${Math.min(...widths)}–${Math.max(...widths)} mm, height ${Math.min(...heights)}–${Math.max(...heights)} mm`
    })
    .filter(Boolean)
  return parts.join('; ') || 'no matrix on this line'
}

interface ToolResult {
  content: string
  suggestions?: Suggestion[]
  speak?: string
}

const reply = (content: string, suggestions?: Suggestion[], speak?: string): ToolResult => ({ content, suggestions, speak })

interface ChatState {
  detail: SalesQuoteDetailResponse | null
  loaded: boolean
  userTexts: string[]
  locale: ChatLocale
}

const latestUser = (state: ChatState): string => state.userTexts.at(-1) ?? ''
const say = (state: ChatState) => phrases[state.locale]

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

const str = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
const num = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

export const runQuoteChatTools = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string | undefined,
  clientDocument: unknown,
  baseRevision: number | undefined,
  executeName: string,
  args: unknown,
  state: ChatState,
): Promise<ToolResult> => {
  if (!state.loaded) {
    state.loaded = true
    if (quoteId) {
      const loaded = await getQuote(ctx, quoteId)
      if (!loaded) return reply('That quote was not found.')
      const parsedDocument = quoteDocumentSchema.safeParse(clientDocument)
      state.detail =
        parsedDocument.success && baseRevision
          ? { ...loaded, version: { ...loaded.version, document: parsedDocument.data, revision: baseRevision } }
          : loaded
    }
  }

  try {
    return await dispatch(ctx, actor, state, executeName, asRecord(args))
  } catch (error) {
    if (error instanceof QuoteConflictError) {
      if (quoteId) {
        const fresh = await getQuote(ctx, quoteId)
        if (fresh) state.detail = fresh
      }
      const text = say(state).conflict
      return reply(text, undefined, text)
    }
    if (error instanceof QuoteValidationError) return reply(error.message, undefined, error.message)
    throw error
  }
}

const dispatch = async (
  ctx: TenantContext,
  actor: QuoteActor,
  state: ChatState,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> => {
  switch (name) {
    case 'catalog_summary':
      return catalogSummary(ctx)
    case 'search_catalog':
      return searchCatalog(ctx, state, str(args.query) ?? '', args.includeHidden === true)
    case 'get_quote':
      return getQuoteTool(state)
    case 'update_header':
      return updateHeader(ctx, actor, state, args)
    case 'update_lines':
      return updateLines(ctx, actor, state, args)
    case 'set_line_options':
      return setLineOptions(ctx, actor, state, args)
    case 'remove_line':
      return removeLine(ctx, actor, state, args)
    case 'remove_family':
      return removeFamily(ctx, actor, state, args)
    case 'move_family':
      return moveFamily(ctx, actor, state, str(args.familyName) ?? '', str(args.direction) === 'down' ? 'down' : 'up')
    case 'update_family_block':
      return updateFamilyBlock(ctx, actor, state, args)
    case 'switch_family_version':
      return switchFamilyVersion(ctx, actor, state, args)
    case 'edit_text_module':
      return editTextModule(ctx, actor, state, args)
    case 'remove_text_module':
      return removeTextModule(ctx, actor, state, args)
    case 'insert_text_template':
      return insertTextTemplate(ctx, actor, state, args)
    case 'remove_activity':
      return removeActivity(ctx, actor, state, args)
    case 'set_payments':
      return setPayments(ctx, actor, state, args)
    case 'set_quote_status':
      return setStatus(ctx, actor, state, args)
    case 'save_new_version':
      return saveNewVersion(ctx, actor, state)
    case 'restore_revision':
      return restoreRevision(ctx, actor, state, args)
    case 'update_print_settings':
      return updatePrintSettings(ctx, actor, state, args)
    case 'preview_pdf':
      return previewPdf(state)
    case 'duplicate_quote':
      return duplicateQuote(ctx, actor, state, args)
    case 'cancel_action':
      return reply(say(state).cancelled, undefined, say(state).cancelled)
    case 'describe_family':
      return describeFamily(ctx, str(args.familyId) ?? '')
    case 'create_quote':
      return createDraft(ctx, actor, state, args)
    case 'add_product':
      return addProduct(ctx, actor, state, args)
    case 'duplicate_line':
      return duplicateLine(ctx, actor, state, str(args.lineName) ?? '')
    case 'duplicate_family':
      return duplicateFamily(ctx, actor, state, str(args.familyName) ?? '')
    case 'move_line':
      return moveLine(ctx, actor, state, str(args.lineName) ?? '', str(args.direction) === 'down' ? 'down' : 'up')
    case 'add_text_module':
      return addTextModule(ctx, actor, state, args)
    case 'add_activity':
      return addActivity(ctx, actor, state, args)
    case 'update_line':
      return updateLine(ctx, actor, state, args)
    default:
      return reply(`Unknown tool ${name}`)
  }
}

const familyLine = (family: {
  id: string
  name: string
  version: number
  brand: string | null
  isPublished: boolean
  inLibrary: boolean
  readyForInvoicing: boolean
  priceValidFrom: string | null
  priceValidTo: string | null
}): string => {
  const status = family.isPublished ? 'published' : 'draft'
  const addable = isQuotable(family) ? 'can add' : 'cannot add'
  return `- ${family.name} | id ${family.id} | v${family.version} | ${family.brand || 'no brand'} | ${status} | ${validityLabel(family)} | ${addable}`
}

const catalogSummary = async (ctx: TenantContext): Promise<ToolResult> => {
  const families = await listProductFamilies(ctx, { includeOutOfLibrary: true })
  const current = families.filter(isQuotable)
  const hidden = families.filter((family) => !isQuotable(family))
  const lines = await listLinesForFamilies(ctx, families.map((family) => family.id))
  const currentIds = new Set(current.map((family) => family.id))
  const currentLines = lines.filter((line) => currentIds.has(line.productFamilyId)).length
  const names = current.slice(0, 12).map((family) => familyLine(family)).join('\n')
  return reply(
    `Current families: ${current.length}. Product lines in those families: ${currentLines}. Draft or expired families: ${hidden.length} (${lines.length - currentLines} lines), not addable unless the user asks to see them.\nCurrent families:\n${names || '—'}`,
  )
}

const searchCatalog = async (ctx: TenantContext, state: ChatState, query: string, includeHidden: boolean): Promise<ToolResult> => {
  if (state.detail && isEditRequest(latestUser(state))) {
    const onQuote = findLines(state.detail.version.document, query).length > 0 || findLines(state.detail.version.document, latestUser(state)).length > 0
    if (onQuote) return reply(say(state).onQuote)
  }
  if (wantsHiddenCatalog(latestUser(state)) || wantsHiddenCatalog(query)) {
    const families = await listProductFamilies(ctx, { includeOutOfLibrary: true })
    const focus = catalogQuery(`${query} ${latestUser(state)}`)
      .replace(/\b(mostra|anche|bozz\w*|listini|scadut\w*|expired|draft\w*|und|auch|zeig\w*)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const hidden = families.filter((family) => !isQuotable(family) && (!focus || nameMatches(family.name, focus) || (family.brand ? nameMatches(family.brand, focus) : false)))
    const p = say(state)
    if (hidden.length === 0) return reply(p.hiddenNone, undefined, p.hiddenNone)
    const lines = hidden.slice(0, 12).map((family) => {
      const status = !family.isPublished ? p.draft : p.expired
      return `- v${family.version} · ${status} · ${family.id.slice(0, 8)} · ${family.name} · ${p.cannotAdd}`
    })
    const text = lines.join('\n')
    return reply(text, undefined, text)
  }
  const families = await listProductFamilies(ctx, { includeOutOfLibrary: true })
  const queries = expandQuery(query)
  const matchesFamily = (family: (typeof families)[number]) =>
    queries.some((term) => nameMatches(family.name, term) || (family.brand ? nameMatches(family.brand, term) : false))
  const hits = families.filter(matchesFamily)
  const visible = includeHidden ? hits : hits.filter(isQuotable)
  const hiddenCount = hits.length - hits.filter(isQuotable).length
  const pickedLine = quotedName(query)
  const requestedFamilyId = query.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]
  const wantsLines = Boolean(pickedLine) || Boolean(requestedFamilyId) || visible.length === 0 || /\d/.test(query)
  const scoped = requestedFamilyId ? families.filter((family) => family.id === requestedFamilyId) : visible.length > 0 && !pickedLine ? visible : includeHidden ? families : families.filter(isQuotable)
  const pool = scoped.slice(0, 40)
  const productLines = await listLinesForFamilies(ctx, pool.map((family) => family.id))
  const byFamily = new Map(pool.map((family) => [family.id, family]))
  const lineQuery = withoutSize(pickedLine ?? query)
  const allLineHits = selectNameMatches(productLines, (line) => line.name, lineQuery)
  const lineHits = allLineHits.slice(0, 8)
  const lineText = lineHits
    .map((line) => {
      const family = byFamily.get(line.productFamilyId)
      return family ? `- ${line.name} | family ${family.name} | familyId ${family.id} | ${isQuotable(family) ? 'can add' : 'cannot add'}` : null
    })
    .filter(Boolean)
    .join('\n')

  if (visible.length === 0 && lineHits.length === 0) {
    return reply(
      hiddenCount > 0
        ? `No current family or product matches "${query}". ${hiddenCount} draft or expired family match(es) exist. Ask the user before calling search_catalog again with includeHidden true. Do not add those.`
        : `No family or product matches "${query}". Call catalog_summary if the user wants to know what exists.`,
      hiddenCount > 0 ? [{ label: 'Mostra anche bozze e listini scaduti', message: `Mostra anche bozze e listini scaduti per ${query}` }] : undefined,
    )
  }
  const shown = visible.slice(0, 8)
  const familyText = shown.map((family) => familyLine(family)).join('\n')
  const more = visible.length > 8 ? `\n${visible.length - 8} more families not shown. Ask the user to narrow the name.` : ''
  const choice = shown.length > 1 ? '\nSeveral families match. Ask the user which one. Do not add yet.' : shown.length === 1 ? '\nOne family match. You may use this id.' : ''
  const typedSize = sizesIn(state.userTexts.join('\n')).at(-1)
  const lineChoices = lineStepChoices(lineHits, pool, state, typedSize)
  const addable = shown.filter(isQuotable)
  const suggestions =
    lineChoices.length > 1
      ? lineChoices
      : addable.length > 1
        ? addable.map((family) => familyChoice(family, state))
        : undefined
  const products = lineText ? `\nProduct lines:\n${lineText}` : ''
  const sameLine =
    new Set(lineHits.map((line) => line.productFamilyId)).size > 1
      ? '\nThis line is in several families. Each choice names the family and its id. Do not add until the user picks one.'
      : ''
  const moreLines = allLineHits.length > 8 ? `\n${allLineHits.length - 8} more product lines not shown.` : ''
  const hiddenNote = hiddenCount > 0 ? `\n${hiddenCount} draft or expired match(es) are listed above and are not addable.` : ''
  const question = lineChoices.some((item) => /profondit/i.test(item.label))
    ? say(state).whichDepth
    : familyStep(lineChoices)
      ? say(state).whichFamily
      : say(state).which
  const speak = suggestions && suggestions.length > 1 ? `${question}\n${suggestions.map((item) => item.label).join('\n')}` : undefined
  return reply(`${familyText}${more}${choice}${products}${moreLines}${sameLine}${hiddenNote}`.trim(), suggestions, speak)
}

const familyChoice = (
  family: { id: string; name: string; version: number; isPublished: boolean; priceValidFrom: string | null; priceValidTo: string | null },
  state: ChatState,
): Suggestion => {
  const p = say(state)
  const status = !family.isPublished ? p.draft : priceValidityStatus(family, priceValidityToday()) !== 'current' ? p.expired : validityLabel(family)
  return {
    label: chipLabel(`v${family.version} · ${status} · ${family.id.slice(0, 8)}`, family.name),
    message: `Usa la famiglia "${family.name}" versione ${family.version}, id ${family.id}`,
    action: { tool: 'describe_family', args: { familyId: family.id } },
  }
}

/** Distinct line names first. The family is the second step, and only for that exact line. */
const lineStepChoices = (
  hits: { name: string; productFamilyId: string }[],
  families: { id: string; name: string; version: number; isPublished: boolean; priceValidFrom: string | null; priceValidTo: string | null; inLibrary: boolean; readyForInvoicing: boolean }[],
  state: ChatState,
  size?: { widthMm: number; heightMm: number; quantity?: number },
): Suggestion[] => {
  const addableFamilies = new Map(families.filter(isQuotable).map((family) => [family.id, family]))
  const usable = hits.flatMap((line) => {
    const family = addableFamilies.get(line.productFamilyId)
    return family ? [{ name: line.name, familyId: family.id, familyName: family.name, version: family.version }] : []
  })
  const stepped = catalogStepSuggestions(usable, latestUser(state), size)
  return stepped.choices.map((choice) => ({
    label: choice.label,
    message: choice.message,
    action: {
      tool: 'add_product',
      args: {
        lineName: choice.lineName,
        ...(choice.familyId ? { familyId: choice.familyId } : {}),
        ...(size ? { widthMm: size.widthMm, heightMm: size.heightMm, quantity: size.quantity } : {}),
      },
    },
  }))
}

const familyStep = (choices: Suggestion[]): boolean => choices.length > 0 && choices.every((choice) => typeof choice.action?.args.familyId === 'string')

const describeFamily = async (ctx: TenantContext, familyId: string): Promise<ToolResult> => {
  if (!isUuid(familyId)) return reply('That is not a catalog family id.')
  const detail = await getProductFamilyDetailWithLibrary(ctx, familyId)
  if (!detail) return reply('Family not found.')
  const lines = detail.lines
    .map((line) => `- ${line.name} | id ${line.id} | ${line.unitSymbol}`)
    .join('\n')
  const groups = detail.characteristics
    .filter((item) => !item.parentId)
    .map((group) => {
      const options = detail.characteristics.filter((item) => item.parentId === group.id).map((item) => item.name)
      return `- ${group.name}: ${options.join(', ') || '—'}`
    })
    .join('\n')
  const bounds = detail.matrices
    .map((matrix) => {
      const widths = Array.isArray(matrix.widths) ? (matrix.widths as number[]) : []
      const heights = Array.isArray(matrix.heights) ? (matrix.heights as number[]) : []
      if (!widths.length || !heights.length) return null
      return `width ${Math.min(...widths)}–${Math.max(...widths)} mm, height ${Math.min(...heights)}–${Math.max(...heights)} mm`
    })
    .filter(Boolean)
  return reply(
    `${detail.family.name} v${detail.family.version} | ${isQuotable({ ...detail.family, inLibrary: detail.inLibrary }) ? 'can add' : 'cannot add'}\nLines:\n${lines}\nOptions:\n${groups || '—'}\nMatrix bounds: ${bounds.join('; ') || 'none'}`,
  )
}

const paragraphHtml = (value: string): string => {
  const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  return `<p>${escaped}</p>`
}

const addTextModule = async (
  ctx: TenantContext,
  actor: QuoteActor,
  state: ChatState,
  args: Record<string, unknown>,
): Promise<ToolResult> => {
  if (isRemoving(latestUser(state))) return reply('The user asked to remove a text module. Call remove_text_module.')
  const text = typeof args.text === 'string' ? args.text.trim() : ''
  if (!text || isNonsenseDump(text) || isNonsenseDump(latestUser(state))) {
    const refusal = say(state).nonsense
    return reply(refusal, undefined, refusal)
  }
  if (text.length > 10_000) return reply('That text is too long.')
  const place = str(args.place) === 'closing' ? 'closing' : 'intro'
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const html = paragraphHtml(text)
  if (place === 'closing') {
    if (document.closing.length >= 50) return reply('The closing already has 50 blocks.')
    document.closing.push({ id: localId('c'), type: 'text', html })
  } else {
    if (document.intro.length >= 50) return reply('The introduction already has 50 text modules.')
    document.intro.push({ id: localId('m'), html })
  }
  const saved = await persist(ctx, actor, state, document)
  return reply(`Added a text module to the ${place}: "${text || '(empty)'}".\n${saved.content}`)
}

const addActivity = async (
  ctx: TenantContext,
  actor: QuoteActor,
  state: ChatState,
  args: Record<string, unknown>,
): Promise<ToolResult> => {
  const another = anotherProductQuery(latestUser(state))
  if (another) return searchCatalog(ctx, state, another, false)
  if (isRemoving(latestUser(state))) return reply('The user asked to remove an activity. Call remove_activity. Do not move it to Not included.')
  const description = str(args.description)
  if (!description) return reply('Activity description is required.')
  if (description.length > 500) return reply('Activity description is too long (500 characters).')
  const included = typeof args.included === 'boolean' ? args.included : true
  const enabled = typeof args.printed === 'boolean' ? args.printed : true
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const block = document.closing.find((item) => item.type === 'activities')
  const rows = block?.type === 'activities' ? block.rows : []
  const placed = placeActivity(rows, { id: localId('att'), description, included, enabled })
  const zone = included ? 'included' : 'not included'
  const print = enabled ? 'printed' : 'not printed'
  if (placed.action === 'unchanged') {
    const existing = placed.rows.find((row) => foldName(row.description) === foldName(description))
    return reply(`"${existing?.description ?? description}" is already ${zone} and ${print}.`)
  }
  if (block?.type === 'activities') block.rows = placed.rows
  else document.closing.push({ id: localId('c'), type: 'activities', rows: placed.rows })
  const saved = await persist(ctx, actor, state, document)
  const verb = placed.action === 'added' ? 'Added' : 'Moved'
  return reply(`${verb} activity "${description}" (${zone}, ${print}).\n${saved.content}`)
}

const requireQuote = (state: ChatState): SalesQuoteDetailResponse => {
  if (!state.detail) throw new QuoteValidationError('No quote is open. Create one first.')
  return state.detail
}

const persist = async (
  ctx: TenantContext,
  actor: QuoteActor,
  state: ChatState,
  document: QuoteDocument,
  mode?: 'update' | 'newVersion',
): Promise<ToolResult> => {
  const current = requireQuote(state)
  const saved = await saveQuoteVersion(ctx, actor, current.quote.id, current.version.id, {
    document,
    mode: mode ?? (current.version.status === 'draft' ? 'update' : 'newVersion'),
    baseRevision: current.version.revision,
  })
  state.detail = saved
  return reply(summarizeDocument(saved.version.document))
}

const changedSpeak = (state: ChatState, verb: string, lines: QuoteLine[]): string => {
  const total = state.detail ? quoteTotal(state.detail.version.document) : 0
  const rows = lines
    .map((line) => `${line.name} ${line.widthMm ?? '—'}×${line.heightMm ?? '—'} qty ${line.quantity} €/pc ${line.unitPrice} VAT ${line.vatRate}`)
    .join('; ')
  return `${verb}${rows ? `: ${rows}` : ''}. ${say(state).total} ${total.toFixed(2)}`
}

const createDraft = async (
  ctx: TenantContext,
  actor: QuoteActor,
  state: ChatState,
  args: Record<string, unknown>,
): Promise<ToolResult> => {
  if (state.detail && !isNewQuoteRequest(latestUser(state))) {
    const text = `${say(state).onQuote} Use update_header for the customer, address, date, or notes.`
    return reply(text, undefined, text)
  }
  const customerName = str(args.customerName)
  if (!customerName) return reply('Customer name is required.')
  const created = await createQuote(ctx, actor, {
    reference: str(args.reference) ?? customerName.slice(0, 100),
    header: { customerName, projectLocation: str(args.projectLocation) ?? null, customerFiscalCode: null, customerAddress: null, customerCity: null },
  })
  state.detail = created
  return reply(`Created quote ${created.quote.reference} for ${created.quote.customerName}. id ${created.quote.id}.\n${summarizeDocument(created.version.document)}`)
}

const addProduct = async (
  ctx: TenantContext,
  actor: QuoteActor,
  state: ChatState,
  args: Record<string, unknown>,
): Promise<ToolResult> => {
  const another = anotherProductQuery(latestUser(state))
  if (another && sizesIn(latestUser(state)).length === 0 && !quotedName(latestUser(state))) return searchCatalog(ctx, state, another, false)
  const current = requireQuote(state)
  const choosing = choiceIndex(latestUser(state), 32) !== null || sizeOnly(latestUser(state)) !== null
  let familyId = str(args.familyId)
  const requestedName = str(args.lineName)
  if (!requestedName) return reply('lineName is required.')
  const saidName = choosing || state.userTexts.some((text) => foldName(text).includes(foldName(requestedName)))
  const lineName = saidName ? requestedName : catalogQuery(latestUser(state)) || requestedName
  if (familyId && !choosing && !mentionedId(state.userTexts, familyId)) familyId = undefined
  if (sizeIssue(latestUser(state)) === 'invalid') return reply(say(state).invalidSize, undefined, say(state).invalidSize)
  const resolved = sizeForTurn(state.userTexts, args.widthMm, args.heightMm)
  if (!resolved) {
    const chip: Suggestion[] | undefined = lineName
      ? [
          {
            label: say(state).needSize,
            message: say(state).needSize,
            action: {
              tool: 'add_product',
              args: { lineName, ...(familyId ? { familyId } : {}), ...(num(args.quantity) ? { quantity: num(args.quantity) } : {}) },
            },
          },
        ]
      : undefined
    return reply(say(state).needSize, chip, say(state).needSize)
  }
  const widthMm = resolved.widthMm
  const heightMm = resolved.heightMm
  if (familyId && !isUuid(familyId)) {
    const block = current.version.document.families.find((item) => item.id === familyId)
    familyId = block?.productFamilyId ?? undefined
  }
  if (familyId && !isUuid(familyId)) return reply('That is not a catalog family id.')
  const families = (await listProductFamilies(ctx, { includeOutOfLibrary: true })).filter(isQuotable)
  const lines = await listLinesForFamilies(ctx, families.map((family) => family.id))
  const hits = selectNameMatches(lines, (line) => line.name, lineName)
  const names = [...new Set(hits.map((line) => line.name.trim()))]
  if (!familyId && names.length !== 1) {
    const choices = lineStepChoices(hits, families, state, { widthMm, heightMm, quantity: num(args.quantity) })
    if (choices.length === 0) return reply(`No current line matches "${lineName}".`)
    const question = familyStep(choices) ? say(state).whichFamily : names.some((name) => /profondit/i.test(name)) ? say(state).whichDepth : say(state).which
    return reply(`${question}\n${choices.map((choice) => choice.label).join('\n')}`, choices, `${question}\n${choices.map((choice) => choice.label).join('\n')}`)
  }
  if (!familyId) {
    const familyIds = [...new Set(hits.map((line) => line.productFamilyId))]
    if (familyIds.length !== 1) {
      const choices = lineStepChoices(hits, families, state, { widthMm, heightMm, quantity: num(args.quantity) })
      return reply(`${say(state).whichFamily}\n${choices.map((choice) => choice.label).join('\n')}`, choices, `${say(state).whichFamily}\n${choices.map((choice) => choice.label).join('\n')}`)
    }
    familyId = familyIds[0]
  }
  if (!familyId) return reply('familyId is required.')

  const detail = await getProductFamilyDetailWithLibrary(ctx, familyId)
  if (!detail) return reply('Family not found.')
  if (!isQuotable({ ...detail.family, inLibrary: detail.inLibrary })) {
    return reply(`${detail.family.name} v${detail.family.version} is not a current published family. Do not add it.`)
  }
  const lineHits = selectNameMatches(detail.lines, (line) => line.name, lineName)
  if (lineHits.length === 0) return reply(`No line named "${lineName}" in ${detail.family.name}. Lines: ${detail.lines.map((line) => line.name).join(' | ')}`)
  if (lineHits.length > 1) {
    const choices = lineHits.slice(0, 8).map((line) => ({
      label: line.name.trim(),
      message: `Aggiungi "${line.name.trim()}", ${widthMm}×${heightMm} mm`,
      action: { tool: 'add_product', args: { familyId, lineName: line.name.trim(), widthMm, heightMm, quantity: num(args.quantity) } },
    }))
    const question = lineHits.some((line) => /profondit/i.test(line.name)) ? say(state).whichDepth : say(state).which
    return reply(`${question}\n${choices.map((choice) => choice.label).join('\n')}`, choices, `${question}\n${choices.map((choice) => choice.label).join('\n')}`)
  }
  const catalogLine = lineHits[0]!
  const quantity = Math.max(1, Math.round(num(args.quantity) ?? 1))
  const document = structuredClone(current.version.document)
  let family = document.families.find((item) => item.productFamilyId === familyId)
  if (!family) {
    family = {
      id: localId('f'),
      productFamilyId: familyId,
      name: detail.family.name,
      category: detail.family.category ?? '',
      isAlternative: false,
      description: detail.family.description1 ?? '',
      notes: detail.family.description2 ?? '',
      lines: [],
    }
    document.families.push(family)
  }
  const row: QuoteLine = {
    id: localId('l'),
    code: nextCode(family),
    productLineId: catalogLine.id,
    name: catalogLine.name,
    quantity,
    unit: catalogLine.unitSymbol,
    widthMm,
    heightMm,
    options: [],
    priceMode: 'catalog',
    unitPrice: 0,
    extraMarkupPct: 0,
    discountPct: 0,
    vatRate: '22%',
    installationHours: catalogLine.installationHoursPerUnit == null ? null : Number(catalogLine.installationHoursPerUnit),
    locked: false,
    isAlternative: false,
  }
  family.lines.push(row)
  const priced = await priceQuoteLines(ctx, {
    lines: [{ key: row.id, productFamilyId: familyId, productLineId: catalogLine.id, widthMm, heightMm, options: [] }],
  })
  const price = priced.find((item) => item.key === row.id)
  if (price && price.ok) row.unitPrice = price.unitPrice
  if (price && !price.ok) {
    const bounds = matrixBounds(detail, catalogLine.pricingMatrixId)
    const text = `Could not price ${catalogLine.name} at ${widthMm}×${heightMm} mm: ${price.error}. Bounds: ${bounds}`
    return reply(text, undefined, text)
  }
  const saved = await persist(ctx, actor, state, document)
  const text = changedSpeak(state, say(state).added, [row])
  return reply(`${text}\n${saved.content}`, undefined, `${text} · ${detail.family.name}`)
}

const duplicateLine = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, query: string): Promise<ToolResult> => {
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const hits = findLines(document, query)
  if (hits.length === 0) return reply(`No row matches "${query}".`)
  if (hits.length > 1) {
    const choices = rowChoices('duplicate_line', hits)
    return reply(`${say(state).whichRow}\n${choices.map((choice) => choice.label).join('\n')}`, choices, `${say(state).whichRow}\n${choices.map((choice) => choice.label).join('\n')}`)
  }
  const { family, line } = hits[0]!
  family.lines.push({ ...structuredClone(line), id: localId('l'), code: nextCode(family) })
  const saved = await persist(ctx, actor, state, document)
  return reply(`Duplicated ${line.name}.\n${saved.content}`)
}

const duplicateFamily = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, query: string): Promise<ToolResult> => {
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const hits = findFamilies(document, query)
  if (hits.length === 0) return reply(`No family on the quote matches "${query}".`)
  if (hits.length > 1) {
    return reply(
      `Several families match. Ask which one:\n${hits.map((family) => `- ${family.name}`).join('\n')}`,
      hits.map((family) => ({ label: family.name, message: `Duplica la famiglia ${family.name}` })),
    )
  }
  const source = hits[0]!
  document.families.push({
    ...structuredClone(source),
    id: localId('f'),
    lines: source.lines.map((line) => ({ ...structuredClone(line), id: localId('l') })),
  })
  const saved = await persist(ctx, actor, state, document)
  return reply(`Duplicated family ${source.name}.\n${saved.content}`)
}

const moveLine = async (
  ctx: TenantContext,
  actor: QuoteActor,
  state: ChatState,
  query: string,
  direction: 'up' | 'down',
): Promise<ToolResult> => {
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const hits = findLines(document, query)
  if (hits.length !== 1) {
    if (hits.length === 0) return reply(`No row matches "${query}".`)
    const choices = rowChoices('move_line', hits, { direction })
    return reply(`${say(state).whichRow}\n${choices.map((choice) => choice.label).join('\n')}`, choices, `${say(state).whichRow}\n${choices.map((choice) => choice.label).join('\n')}`)
  }
  const { family, line } = hits[0]!
  const index = family.lines.findIndex((item) => item.id === line.id)
  const next = index + (direction === 'up' ? -1 : 1)
  if (next < 0 || next >= family.lines.length) return reply(`That row is already at the ${direction === 'up' ? 'top' : 'bottom'}.`)
  const [moved] = family.lines.splice(index, 1)
  family.lines.splice(next, 0, moved!)
  const saved = await persist(ctx, actor, state, document)
  const order = family.lines.map((item, place) => `${place + 1}. ${item.name}`).join(', ')
  return reply(`Moved ${line.name} ${direction}. Order is now ${order}.\n${saved.content}`)
}

const withoutToken = (args: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'confirmToken'))

/** Returns the confirm chips when the token is missing. A bad or already used token is reported and not replaced. Returns null when the action may proceed. */
const confirmOrAsk = (state: ChatState, tool: string, args: Record<string, unknown>, summary: string): ToolResult | null => {
  const current = requireQuote(state)
  const secret = process.env.AUTH_SECRET ?? ''
  const payload = withoutToken(args)
  const decision = decideConfirm({
    secret,
    token: str(args.confirmToken),
    expected: { quoteId: current.quote.id, tool, args: payload },
  })
  if (decision === 'proceed') return null
  if (decision === 'invalid') {
    const text = secret ? say(state).confirmInvalid : 'Confirmation is not configured.'
    return reply(text, undefined, text)
  }
  const issued = issueConfirmToken(secret, { quoteId: current.quote.id, revision: current.version.revision, tool, args: payload })
  const p = say(state)
  const choices: Suggestion[] = [
    { label: p.confirm, message: p.confirm, action: { tool, args: { ...payload, confirmToken: issued } } },
    { label: p.cancel, message: p.cancel, action: { tool: 'cancel_action', args: {} } },
  ]
  return reply(`${summary}\n${p.confirmAsk}`, choices, `${summary}\n${p.confirmAsk}`)
}

/** The rows the user named. A miss is not filled with a different row. */
const linesForEdit = (
  state: ChatState,
  document: QuoteDocument,
  modelQuery: string,
): { hits: { family: QuoteFamily; line: QuoteLine }[] } | { stop: ToolResult } => {
  const subject = namedTarget(latestUser(state))
  if (!subject) return { hits: findLines(document, modelQuery) }
  const subjectHits = phraseLines(document, subject)
  if (subjectHits.length === 0) {
    const text = `${say(state).notOnQuote}: "${subject}".`
    return { stop: reply(text, undefined, text) }
  }
  const allowed = new Set(subjectHits.map((hit) => hit.line.id))
  const modelHits = findLines(document, modelQuery).filter((hit) => allowed.has(hit.line.id))
  return { hits: modelHits.length > 0 ? modelHits : subjectHits }
}

const updateLine = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const another = anotherProductQuery(latestUser(state))
  if (another) return searchCatalog(ctx, state, another, false)
  const current = requireQuote(state)
  const query = str(args.lineName) ?? ''
  const document = structuredClone(current.version.document)
  const targeted = linesForEdit(state, document, query)
  if ('stop' in targeted) return targeted.stop
  const hits = targeted.hits
  if (hits.length !== 1) {
    if (hits.length === 0) return reply(`No row matches "${query}".`)
    const choices = rowChoices('update_line', hits, withoutToken(args))
    return reply(`${say(state).whichRow}\n${choices.map((choice) => choice.label).join('\n')}`, choices, `${say(state).whichRow}\n${choices.map((choice) => choice.label).join('\n')}`)
  }
  const { line } = hits[0]!
  const before = JSON.stringify(line)
  const latest = latestUser(state)
  const issue = sizeIssue(latest)
  if (issue === 'invalid') return reply(say(state).invalidSize, undefined, say(state).invalidSize)
  if (issue === 'partial') return reply(say(state).needBoth, undefined, say(state).needBoth)
  const quantity = num(args.quantity)
  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000)) {
    return reply(say(state).quantity, undefined, say(state).quantity)
  }
  const typedSize = sizesIn(latest).length > 0 ? sizeForTurn([latest], args.widthMm, args.heightMm) : undefined
  const sizeChanged = Boolean(typedSize)
  if (typedSize) {
    line.widthMm = typedSize.widthMm
    line.heightMm = typedSize.heightMm
  }
  const extra = num(args.extraPct)
  const discount = num(args.discountPct)
  const hours = num(args.installationHours)
  const unitPrice = num(args.unitPrice)
  const nextName = str(args.name)
  if (nextName) line.name = nextName.slice(0, 300)
  if (typeof args.isAlternative === 'boolean') line.isAlternative = args.isAlternative
  if (typeof args.locked === 'boolean') line.locked = args.locked
  if (unitPrice !== undefined && unitPrice <= 0) {
    const text = 'A manual €/pc must be greater than zero.'
    return reply(text, undefined, text)
  }
  const discountStated = discount === undefined || state.userTexts.some((text) => new RegExp(`\\b${discount}\\b`).test(text))
  if ((unitPrice !== undefined && unitPrice > 0) || !discountStated) {
    const pending = confirmOrAsk(state, 'update_line', { ...args, lineName: line.id }, `${say(state).confirmAsk} ${line.name}`)
    if (pending) return pending
  }
  if (extra !== undefined) line.extraMarkupPct = extra
  if (discount !== undefined) line.discountPct = Math.min(100, Math.max(0, discount))
  if (quantity !== undefined) line.quantity = quantity
  if (hours !== undefined) line.installationHours = hours
  const vat = str(args.vatRate)
  if (vat) {
    if (!VAT_RATES.includes(vat as VatRate)) return reply(`VAT must be one of ${VAT_RATES.join(', ')}.`)
    line.vatRate = vat as VatRate
  }
  if (unitPrice !== undefined && unitPrice > 0) {
    line.priceMode = 'manual'
    line.unitPrice = unitPrice
  } else if (line.priceMode === 'catalog' && line.productLineId && sizeChanged) {
    const family = hits[0]!.family
    if (family.productFamilyId && line.widthMm && line.heightMm) {
      const priced = await priceQuoteLines(ctx, {
        lines: [
          {
            key: line.id,
            productFamilyId: family.productFamilyId,
            productLineId: line.productLineId,
            widthMm: line.widthMm,
            heightMm: line.heightMm,
            options: line.options.map((option) => ({ characteristicId: option.characteristicId, subCharacteristicId: option.subCharacteristicId })),
          },
        ],
      })
      const price = priced.find((item) => item.key === line.id)
      if (price && !price.ok) return reply(`Could not price ${line.name} at ${line.widthMm}×${line.heightMm} mm: ${price.error}`)
      if (price && price.ok) line.unitPrice = price.unitPrice
    }
  }
  if (JSON.stringify(line) === before) return reply(say(state).nothing, undefined, say(state).nothing)
  const manualNote = unitPrice !== undefined ? 'This row is now a manual €/pc and will not follow the catalog. ' : ''
  const saved = await persist(ctx, actor, state, document)
  const text = `${manualNote}${changedSpeak(state, say(state).updated, [line])}`
  return reply(`${text}\n${saved.content}`, undefined, text)
}

const getQuoteTool = (state: ChatState): ToolResult => {
  const current = requireQuote(state)
  const document = current.version.document
  const payments = document.closing
    .filter((block) => block.type === 'payments')
    .flatMap((block) => (block.type === 'payments' ? block.rows : []))
    .map((row) => `${row.description} ${row.pct}%`)
    .join(', ')
  const text = `Quote ${current.quote.reference} for ${document.header.customerName}. Status ${current.version.status}. Date ${document.header.quoteDate}. Site ${document.header.projectLocation ?? '—'}. Notes ${document.header.notes || '—'}. Payments ${payments || '—'}.\n${summarizeDocument(document)}`
  return reply(text, undefined, text)
}

const updateHeader = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const before = JSON.stringify(document.header)
  const customerName = str(args.customerName)
  const fiscal = str(args.customerFiscalCode)
  const address = str(args.customerAddress)
  const city = str(args.customerCity)
  const site = str(args.projectLocation)
  const notes = typeof args.notes === 'string' ? args.notes : undefined
  const date = str(args.quoteDate)
  if (customerName) document.header.customerName = customerName.slice(0, 300)
  if (fiscal) document.header.customerFiscalCode = fiscal.slice(0, 100)
  if (address) document.header.customerAddress = address.slice(0, 500)
  if (city) document.header.customerCity = city.slice(0, 200)
  if (site) document.header.projectLocation = site.slice(0, 500)
  if (notes !== undefined) document.header.notes = notes.slice(0, 5000)
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply('quoteDate must be an ISO date, for example 2026-12-01.')
    document.header.quoteDate = date
  }
  if (JSON.stringify(document.header) === before) return reply(say(state).nothing, undefined, say(state).nothing)
  const saved = await persist(ctx, actor, state, document)
  const text = `${document.header.customerName}, ${document.header.projectLocation ?? '—'}, ${document.header.quoteDate}. ${say(state).total} ${quoteTotal(saved ? state.detail!.version.document : document).toFixed(2)}`
  return reply(`${text}\n${saved.content}`, undefined, text)
}

const scopedLines = (document: QuoteDocument, scope: string): { family: QuoteFamily; line: QuoteLine }[] => {
  const rows = document.families.flatMap((family) => family.lines.map((line) => ({ family, line })))
  if (scope === 'all' || scope === 'tutte' || scope === 'tutti') return rows
  const ids = scope.split(/[,\s]+/).filter((item) => item.startsWith('l-'))
  if (ids.length > 0) return rows.filter(({ line }) => ids.includes(line.id))
  const families = findFamilies(document, scope)
  if (families.length > 0) return families.flatMap((family) => family.lines.map((line) => ({ family, line })))
  return findLines(document, scope)
}

const updateLines = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const subject = namedTarget(latestUser(state))
  const subjectHits = subject ? phraseLines(document, subject) : []
  if (subject && subjectHits.length === 0) {
    const text = `${say(state).notOnQuote}: "${subject}".`
    return reply(text, undefined, text)
  }
  const hits = subjectHits.length > 0 ? subjectHits : scopedLines(document, str(args.scope) ?? 'all')
  if (hits.length === 0) return reply('No rows match that scope.')
  const discount = num(args.discountPct)
  const stated = discount === undefined || state.userTexts.some((text) => new RegExp(`\\b${discount}\\b`).test(text))
  if (hits.length > 1 || !stated) {
    const pending = confirmOrAsk(state, 'update_lines', args, `${hits.length} rows`)
    if (pending) return pending
  }
  const vat = str(args.vatRate)
  if (vat && !VAT_RATES.includes(vat as VatRate)) return reply(`VAT must be one of ${VAT_RATES.join(', ')}.`)
  const extra = num(args.extraPct)
  const hours = num(args.installationHours)
  for (const { line } of hits) {
    if (vat) line.vatRate = vat as VatRate
    if (extra !== undefined) line.extraMarkupPct = extra
    if (discount !== undefined) line.discountPct = Math.min(100, Math.max(0, discount))
    if (hours !== undefined) line.installationHours = hours
  }
  const saved = await persist(ctx, actor, state, document)
  const text = changedSpeak(state, say(state).updated, hits.map(({ line }) => line))
  return reply(`${text}\n${saved.content}`, undefined, text)
}

const setLineOptions = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const targeted = linesForEdit(state, document, str(args.lineName) ?? latestUser(state))
  if ('stop' in targeted) return targeted.stop
  const hits = targeted.hits
  if (hits.length !== 1) {
    const choices = rowChoices('set_line_options', hits, withoutToken(args))
    if (hits.length === 0) return reply('No row matches.')
    return reply(`${say(state).whichRow}`, choices, say(state).whichRow)
  }
  const { family, line } = hits[0]!
  if (!family.productFamilyId || !line.productLineId) return reply('That row is not from the catalog.')
  const detail = await getProductFamilyDetailWithLibrary(ctx, family.productFamilyId)
  if (!detail) return reply('Family not found.')
  const requested = Array.isArray(args.options) ? args.options : []
  for (const item of requested) {
    const record = asRecord(item)
    const groupName = str(record.group) ?? ''
    const optionName = str(record.option) ?? ''
    const groups = detail.characteristics.filter((entry) => !entry.parentId && nameMatches(entry.name, groupName))
    if (groups.length !== 1) return reply(groups.length === 0 ? `No option group matches "${groupName}".` : `Several groups match "${groupName}".`)
    const group = groups[0]!
    const options = detail.characteristics.filter((entry) => entry.parentId === group.id && nameMatches(entry.name, optionName))
    if (options.length !== 1) return reply(options.length === 0 ? `No option matches "${optionName}".` : `Several options match "${optionName}".`)
    const option = options[0]!
    line.options = line.options.filter((currentOption) => currentOption.characteristicId !== group.id)
    line.options.push({ characteristicId: group.id, subCharacteristicId: option.id, name: group.name, value: option.name })
  }
  const saved = await persist(ctx, actor, state, document)
  const text = changedSpeak(state, say(state).updated, [line])
  return reply(`${text}\n${saved.content}`, undefined, text)
}

const removeLine = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const targeted = linesForEdit(state, document, str(args.lineName) ?? latestUser(state))
  if ('stop' in targeted) return targeted.stop
  const hits = targeted.hits
  if (hits.length !== 1) {
    if (hits.length === 0) return reply('No row matches.')
    const choices = rowChoices('remove_line', hits)
    return reply(say(state).whichRow, choices, say(state).whichRow)
  }
  const { family, line } = hits[0]!
  const pending = confirmOrAsk(state, 'remove_line', { lineName: line.id, familyName: family.id }, `Remove ${line.name}`)
  if (pending) return pending
  family.lines = family.lines.filter((item) => item.id !== line.id)
  const saved = await persist(ctx, actor, state, document)
  const text = `${say(state).updated}: ${line.name} removed. ${say(state).total} ${quoteTotal(state.detail!.version.document).toFixed(2)}`
  return reply(`${text}\n${saved.content}`, undefined, text)
}

const familyChoices = (tool: string, hits: QuoteFamily[], extra: Record<string, unknown> = {}): Suggestion[] =>
  hits.slice(0, 8).map((family) => ({
    label: chipLabel(family.id.slice(0, 8), family.name),
    message: `${tool} id ${family.id}`,
    action: { tool, args: { ...extra, familyName: family.id } },
  }))

const removeFamily = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const subject = namedTarget(latestUser(state))
  if (subject && phraseFamilies(document, subject).length === 0) {
    const text = `${say(state).notOnQuoteFamily}: "${subject}".`
    return reply(text, undefined, text)
  }
  const hits = subject ? phraseFamilies(document, subject) : findFamilies(document, str(args.familyName) ?? latestUser(state))
  if (hits.length !== 1) {
    if (hits.length === 0) return reply('No family on the quote matches.')
    const choices = familyChoices('remove_family', hits)
    return reply(say(state).whichFamily, choices, say(state).whichFamily)
  }
  const family = hits[0]!
  const pending = confirmOrAsk(state, 'remove_family', { familyName: family.id }, `Remove ${family.name}`)
  if (pending) return pending
  document.families = document.families.filter((item) => item.id !== family.id)
  const saved = await persist(ctx, actor, state, document)
  const text = `${family.name} removed. ${say(state).total} ${quoteTotal(state.detail!.version.document).toFixed(2)}`
  return reply(`${text}\n${saved.content}`, undefined, text)
}

const moveFamily = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, query: string, direction: 'up' | 'down'): Promise<ToolResult> => {
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const hits = findFamilies(document, query)
  if (hits.length !== 1) {
    if (hits.length === 0) return reply('No family on the quote matches.')
    const choices = familyChoices('move_family', hits, { direction })
    return reply(say(state).whichFamily, choices, say(state).whichFamily)
  }
  const index = document.families.findIndex((item) => item.id === hits[0]!.id)
  const next = index + (direction === 'up' ? -1 : 1)
  if (next < 0 || next >= document.families.length) return reply(`That family is already at the ${direction === 'up' ? 'top' : 'bottom'}.`)
  const [moved] = document.families.splice(index, 1)
  document.families.splice(next, 0, moved!)
  const saved = await persist(ctx, actor, state, document)
  const text = document.families.map((item, place) => `${place + 1}. ${item.name}`).join(', ')
  return reply(text, undefined, text)
}

const updateFamilyBlock = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const hits = findFamilies(document, str(args.familyName) ?? '')
  if (hits.length !== 1) {
    if (hits.length === 0) return reply('No family on the quote matches.')
    const choices = familyChoices('update_family_block', hits, withoutToken(args))
    return reply(say(state).whichFamily, choices, say(state).whichFamily)
  }
  const family = hits[0]!
  const before = JSON.stringify(family)
  const name = str(args.name)
  const description = typeof args.description === 'string' ? args.description : undefined
  const notes = typeof args.notes === 'string' ? args.notes : undefined
  if (name) family.name = name.slice(0, 300)
  if (description !== undefined) family.description = description.slice(0, 10_000)
  if (notes !== undefined) family.notes = notes.slice(0, 10_000)
  if (typeof args.isAlternative === 'boolean') family.isAlternative = args.isAlternative
  if (JSON.stringify(family) === before) return reply(say(state).nothing, undefined, say(state).nothing)
  const saved = await persist(ctx, actor, state, document)
  return reply(`${family.name}\n${saved.content}`, undefined, family.name)
}

const switchFamilyVersion = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const switchable = (family: QuoteFamily) => {
    const status = current.familyStatus.find((item) => item.productFamilyId === family.productFamilyId)
    return Boolean(status && status.status !== 'current' && status.replacement)
  }
  const generic = /scadut|expired|più recente|latest|aktuellste/i.test(latestUser(state))
  const subject = namedTarget(latestUser(state))
  let pool = str(args.familyName) ? findFamilies(document, str(args.familyName)!) : document.families
  if (subject && !generic) {
    const named = phraseFamilies(document, subject)
    if (named.length === 0) {
      const text = `${say(state).notOnQuoteFamily}: "${subject}".`
      return reply(text, undefined, text)
    }
    pool = named
  }
  const hits = pool.filter(switchable)
  if (hits.length === 0) return reply(say(state).noSwitch, undefined, say(state).noSwitch)
  if (hits.length > 1) {
    const choices = familyChoices('switch_family_version', hits)
    return reply(say(state).whichFamily, choices, say(state).whichFamily)
  }
  const family = hits[0]!
  const status = current.familyStatus.find((item) => item.productFamilyId === family.productFamilyId)
  if (!status?.replacement) return reply(say(state).noSwitch, undefined, say(state).noSwitch)
  const pending = confirmOrAsk(state, 'switch_family_version', { familyName: family.id }, `Switch ${family.name} to ${status.replacement.name} v${status.replacement.version}`)
  if (pending) return pending
  family.productFamilyId = status.replacement.id
  family.name = status.replacement.name
  const saved = await persist(ctx, actor, state, document)
  return reply(`${family.name}\n${saved.content}`, undefined, family.name)
}

const editTextModule = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const text = typeof args.text === 'string' ? args.text.trim() : ''
  const place = str(args.place) === 'closing' ? 'closing' : 'intro'
  const index = Math.max(1, Math.round(num(args.index) ?? 1)) - 1
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  if (place === 'intro') {
    const module = document.intro[index]
    if (!module) return reply('No text module at that position.')
    module.html = paragraphHtml(text)
  } else {
    const module = document.closing.filter((block) => block.type === 'text')[index]
    if (!module) return reply('No text module at that position.')
    module.html = paragraphHtml(text)
  }
  const saved = await persist(ctx, actor, state, document)
  return reply(`Updated the text module.\n${saved.content}`, undefined, text)
}

const removeTextModule = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const place = str(args.place) === 'closing' ? 'closing' : 'intro'
  const index = Math.max(1, Math.round(num(args.index) ?? 1))
  const pending = confirmOrAsk(state, 'remove_text_module', { place, index }, `Remove ${place} module ${index}`)
  if (pending) return pending
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  if (place === 'intro') document.intro.splice(index - 1, 1)
  else {
    const blocks = document.closing.filter((block) => block.type === 'text')
    const target = blocks[index - 1]
    if (!target) return reply('No closing text module at that position.')
    document.closing = document.closing.filter((block) => block.id !== target.id)
  }
  const saved = await persist(ctx, actor, state, document)
  return reply(`Removed the text module.\n${saved.content}`, undefined, say(state).updated)
}

const insertTextTemplate = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const name = str(args.templateName)
  if (!name) return reply('templateName is required.')
  const templates = await listTextTemplates(ctx)
  const hits = selectNameMatches(templates, (template) => template.name, name)
  if (hits.length === 0) return reply(say(state).noTemplate, undefined, say(state).noTemplate)
  if (hits.length > 1) {
    const choices = hits.slice(0, 8).map((template) => ({
      label: template.name,
      message: `Inserisci il testo salvato "${template.name}"`,
      action: { tool: 'insert_text_template', args: { templateName: template.name, place: str(args.place) } },
    }))
    return reply(say(state).which, choices, say(state).which)
  }
  const place = str(args.place) === 'closing' ? 'closing' : 'intro'
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  if (place === 'closing') document.closing.push({ id: localId('c'), type: 'text', html: hits[0]!.html })
  else document.intro.push({ id: localId('m'), html: hits[0]!.html })
  const saved = await persist(ctx, actor, state, document)
  return reply(`Inserted the saved text "${hits[0]!.name}".\n${saved.content}`, undefined, hits[0]!.name)
}

const activityRows = (document: QuoteDocument) => {
  const block = document.closing.find((item) => item.type === 'activities')
  return block?.type === 'activities' ? block.rows : []
}

const removeActivity = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const description = str(args.description) ?? latestUser(state)
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const rows = activityRows(document)
  const hits = rows.filter((row) => nameMatches(row.description, description))
  if (hits.length !== 1) return reply(hits.length === 0 ? 'No activity matches.' : 'Several activities match. Name one of them.')
  const pending = confirmOrAsk(state, 'remove_activity', { description: hits[0]!.description }, `Remove ${hits[0]!.description}`)
  if (pending) return pending
  const block = document.closing.find((item) => item.type === 'activities')
  if (block?.type === 'activities') block.rows = block.rows.filter((row) => row.id !== hits[0]!.id)
  const saved = await persist(ctx, actor, state, document)
  return reply(`Removed activity "${hits[0]!.description}".\n${saved.content}`, undefined, hits[0]!.description)
}

const setPayments = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const requested = Array.isArray(args.rows) ? args.rows : []
  const rows = requested.flatMap((item) => {
    const record = asRecord(item)
    const description = str(record.description)
    const pct = num(record.pct)
    if (!description || pct === undefined) return []
    return [{ id: localId('pag'), description: description.slice(0, 500), pct }]
  })
  const sum = rows.reduce((total, row) => total + row.pct, 0)
  const stated = statedPercents(latestUser(state))
  const statedShort = stated.length >= 2 && !percentsSumTo100(stated)
  if (statedShort || !percentsSumTo100(rows.map((row) => row.pct))) {
    const text = say(state).paymentsSum
    return reply(text, undefined, text)
  }
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const block = document.closing.find((item) => item.type === 'payments')
  if (block?.type === 'payments') block.rows = rows
  else document.closing.push({ id: localId('c'), type: 'payments', rows })
  const saved = await persist(ctx, actor, state, document)
  const text = rows.map((row) => `${row.description} ${row.pct}%`).join(', ')
  return reply(`${text}\n${saved.content}`, undefined, text)
}

const NEXT_STATUS: Record<string, readonly string[]> = {
  draft: ['sent'],
  sent: ['accepted', 'rejected'],
  accepted: ['rejected'],
  rejected: ['accepted'],
}

const setStatus = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const status = str(args.status)
  if (status !== 'draft' && status !== 'sent' && status !== 'accepted' && status !== 'rejected') return reply('Status must be draft, sent, accepted, or rejected.')
  const current = requireQuote(state)
  if (!NEXT_STATUS[current.version.status]?.includes(status)) {
    const text = say(state).badTransition
    return reply(text, undefined, text)
  }
  const pending = confirmOrAsk(state, 'set_quote_status', { status }, `${say(state).confirmAsk} ${statusWord(state.locale, status)}`)
  if (pending) return pending
  const saved = await setQuoteVersionStatusById(ctx, actor, current.quote.id, current.version.id, status)
  state.detail = saved
  const text = `${saved.quote.reference}: ${statusWord(state.locale, saved.version.status)}.`
  return reply(text, undefined, text)
}

const saveNewVersion = async (ctx: TenantContext, actor: QuoteActor, state: ChatState): Promise<ToolResult> => {
  const current = requireQuote(state)
  const saved = await persist(ctx, actor, state, structuredClone(current.version.document), 'newVersion')
  const text = `New version ${state.detail?.version.version}.`
  return reply(`${text}\n${saved.content}`, undefined, text)
}

const restoreRevision = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const current = requireQuote(state)
  const askedPrevious = wantsPreviousRevision(latestUser(state))
  const requested = num(args.revisionNumber)
  const revisionNumber = askedPrevious || !requested ? current.version.revision - 1 : requested
  if (!revisionNumber || revisionNumber < 1 || revisionNumber >= current.version.revision) {
    const text = say(state).noPrevious
    return reply(text, undefined, text)
  }
  const undo = wantsUndo(latestUser(state))
  if (!undo) {
    const pending = confirmOrAsk(state, 'restore_revision', { revisionNumber }, `${say(state).restoreRevision} ${revisionNumber}`)
    if (pending) return pending
  }
  const revision = await getQuoteRevisionDetail(ctx, current.quote.id, current.version.id, revisionNumber)
  if (!revision) {
    const text = say(state).noPrevious
    return reply(text, undefined, text)
  }
  const saved = await persist(ctx, actor, state, revision.document)
  const text = `${say(state).restored} ${revisionNumber}.`
  return reply(`${text}\n${saved.content}`, undefined, text)
}

const PRINT_FLAGS = [
  'showDiscount',
  'showExtraMarkup',
  'showTotal',
  'showPayments',
  'showActivities',
  'showImages',
  'showFamilyDescription',
  'showLineCharacteristics',
  'showFamilySummary',
  'showCategorySummary',
  'showSalesContact',
] as const

const updatePrintSettings = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  let changed = false
  for (const flag of PRINT_FLAGS) {
    if (typeof args[flag] === 'boolean') {
      document.printSettings[flag] = args[flag]
      changed = true
    }
  }
  if (!changed) return reply(say(state).nothing, undefined, say(state).nothing)
  const saved = await persist(ctx, actor, state, document)
  return reply(`${say(state).printUpdated}\n${saved.content}`, undefined, say(state).printUpdated)
}

const previewPdf = (state: ChatState): ToolResult => {
  const current = requireQuote(state)
  const link = `/print/quotes/${current.quote.id}?version=${current.version.version}`
  return reply(link, undefined, link)
}

const duplicateQuote = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const customerName = str(args.customerName)
  if (!customerName) return reply('Customer name is required.')
  const source = requireQuote(state)
  const created = await createQuote(ctx, actor, {
    reference: customerName.slice(0, 100),
    header: { ...source.version.document.header, customerName },
  })
  state.detail = created
  const document = structuredClone(source.version.document)
  document.header = { ...document.header, customerName }
  const saved = await persist(ctx, actor, state, document)
  const text = `${say(state).copied} ${customerName}. id ${state.detail?.quote.id}.`
  return reply(`${text}\n${saved.content}`, undefined, text)
}

export const quoteIdOf = (state: ChatState): string | null => state.detail?.quote.id ?? null

export const createChatState = (input?: { userTexts?: string[]; locale?: ChatLocale }): ChatState => ({
  detail: null,
  loaded: false,
  userTexts: input?.userTexts ?? [],
  locale: input?.locale ?? 'it',
})

/** System context for one turn: the reply language and the open quote, so an edit is not a catalog search. */
export const quotePreamble = async (ctx: TenantContext, quoteId: string | undefined, locale: ChatLocale): Promise<string> => {
  const language = `Reply in ${locale === 'it' ? 'Italian' : locale === 'de' ? 'German' : 'English'}.`
  if (!quoteId) return language
  const loaded = await getQuote(ctx, quoteId)
  if (!loaded) return language
  return `${language}\nOpen quote:\n${summarizeDocument(loaded.version.document)}`
}
