import { expandQuery, nameMatches, type Suggestion } from '@schuco/ai-quote-agent'
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
import { getProductFamilyDetailWithLibrary, listProductFamilies } from './product-families-service'
import {
  QuoteConflictError,
  QuoteValidationError,
  createQuote,
  getQuote,
  priceQuoteLines,
  saveQuoteVersion,
  type QuoteActor,
} from './quotes-service'

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
        .map((line) => {
          const net = lineNetUnitPrice(line)
          const total = lineTotal(line)
          return `  ${line.code} ${line.name} ${line.widthMm ?? '—'}×${line.heightMm ?? '—'} qty ${line.quantity} €/pc ${line.unitPrice} extra ${line.extraMarkupPct}% disc ${line.discountPct}% net ${net.toFixed(2)} total ${total.toFixed(2)} VAT ${line.vatRate} h ${line.installationHours ?? '—'} [${line.id}]`
        })
        .join('\n')
      return `${family.name} [${family.id}]\n${lines || '  (no rows)'}`
    })
    .join('\n')
  return `${rows}\nQuote total ex VAT ${quoteTotal(document).toFixed(2)}`
}

const findLines = (document: QuoteDocument, query: string): { family: QuoteFamily; line: QuoteLine }[] =>
  document.families.flatMap((family) =>
    family.lines
      .filter((line) => nameMatches(line.name, query) || nameMatches(line.code, query) || line.id === query)
      .map((line) => ({ family, line })),
  )

const findFamilies = (document: QuoteDocument, query: string): QuoteFamily[] =>
  document.families.filter((family) => nameMatches(family.name, query) || family.id === query)

interface ToolResult {
  content: string
  suggestions?: Suggestion[]
}

const reply = (content: string, suggestions?: Suggestion[]): ToolResult => ({ content, suggestions })

interface ChatState {
  detail: SalesQuoteDetailResponse | null
  loaded: boolean
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

const str = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

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
    if (error instanceof QuoteValidationError || error instanceof QuoteConflictError) return reply(error.message)
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
    case 'search_catalog':
      return searchCatalog(ctx, str(args.query) ?? '', args.includeHidden === true)
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
    case 'update_line':
      return updateLine(ctx, actor, state, args)
    default:
      return reply(`Unknown tool ${name}`)
  }
}

const searchCatalog = async (ctx: TenantContext, query: string, includeHidden: boolean): Promise<ToolResult> => {
  const families = await listProductFamilies(ctx, { includeOutOfLibrary: true })
  const queries = expandQuery(query)
  const hits = families.filter((family) => queries.some((term) => nameMatches(family.name, term) || (family.brand ? nameMatches(family.brand, term) : false)))
  const visible = includeHidden ? hits : hits.filter(isQuotable)
  const hiddenCount = hits.length - hits.filter(isQuotable).length
  if (visible.length === 0) {
    return reply(
      hiddenCount > 0
        ? `No current family matches "${query}". ${hiddenCount} draft or expired match(es) exist. Ask the user before calling search_catalog again with includeHidden true. Do not add those.`
        : `No family matches "${query}".`,
      hiddenCount > 0 ? [{ label: 'Mostra anche bozze e listini scaduti', message: `Mostra anche bozze e listini scaduti per ${query}` }] : undefined,
    )
  }
  const shown = visible.slice(0, 8)
  const lines = shown.map((family) => {
    const status = family.isPublished ? 'published' : 'draft'
    const addable = isQuotable(family) ? 'can add' : 'cannot add'
    return `- ${family.name} | id ${family.id} | v${family.version} | ${family.brand || 'no brand'} | ${status} | ${validityLabel(family)} | ${addable}`
  })
  const more = visible.length > 8 ? `\n${visible.length - 8} more not shown. Ask the user to narrow the name.` : ''
  const choice = shown.length > 1 ? '\nSeveral matches. Ask the user which one. Do not add yet.' : '\nOne match. You may use this id.'
  const suggestions =
    shown.length > 1
      ? shown.map((family) => ({
          label: `v${family.version} · ${family.name} · ${validityLabel(family)}`,
          message: `Usa la famiglia "${family.name}" versione ${family.version}, id ${family.id}`,
        }))
      : undefined
  return reply(`${lines.join('\n')}${more}${choice}`, suggestions)
}

const describeFamily = async (ctx: TenantContext, familyId: string): Promise<ToolResult> => {
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

const requireQuote = (state: ChatState): SalesQuoteDetailResponse => {
  if (!state.detail) throw new QuoteValidationError('No quote is open. Create one first.')
  return state.detail
}

const persist = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, document: QuoteDocument): Promise<ToolResult> => {
  const current = requireQuote(state)
  const saved = await saveQuoteVersion(ctx, actor, current.quote.id, current.version.id, {
    document,
    mode: current.version.status === 'draft' ? 'update' : 'newVersion',
    baseRevision: current.version.revision,
  })
  state.detail = saved
  return reply(summarizeDocument(saved.version.document))
}

const createDraft = async (
  ctx: TenantContext,
  actor: QuoteActor,
  state: ChatState,
  args: Record<string, unknown>,
): Promise<ToolResult> => {
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
  const current = requireQuote(state)
  const familyId = str(args.familyId)
  const lineName = str(args.lineName)
  const widthMm = num(args.widthMm)
  const heightMm = num(args.heightMm)
  if (!familyId || !lineName) return reply('familyId and lineName are required.')
  if (!widthMm || !heightMm) return reply('Width and height in millimetres are required before adding a catalog row.')

  const detail = await getProductFamilyDetailWithLibrary(ctx, familyId)
  if (!detail) return reply('Family not found.')
  if (!isQuotable({ ...detail.family, inLibrary: detail.inLibrary })) {
    return reply(`${detail.family.name} v${detail.family.version} is not a current published family. Do not add it.`)
  }
  const lineHits = detail.lines.filter((line) => nameMatches(line.name, lineName))
  if (lineHits.length === 0) return reply(`No line named "${lineName}" in ${detail.family.name}. Lines: ${detail.lines.map((line) => line.name).join(' | ')}`)
  if (lineHits.length > 1) {
    return reply(
      `Several lines match "${lineName}". Ask the user which full name:\n${lineHits.map((line) => `- ${line.name}`).join('\n')}`,
      lineHits.map((line) => ({ label: line.name, message: `Aggiungi "${line.name}", ${widthMm}×${heightMm} mm` })),
    )
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
  if (price && !price.ok) return reply(`Could not price ${catalogLine.name} at ${widthMm}×${heightMm} mm: ${price.error}`)
  const saved = await persist(ctx, actor, state, document)
  return reply(`Added a new row.\n${saved.content}`)
}

const duplicateLine = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, query: string): Promise<ToolResult> => {
  const current = requireQuote(state)
  const document = structuredClone(current.version.document)
  const hits = findLines(document, query)
  if (hits.length === 0) return reply(`No row matches "${query}".`)
  if (hits.length > 1) {
    return reply(
      `Several rows match. Ask which one:\n${hits.map(({ line }) => `- ${line.code} ${line.name}`).join('\n')}`,
      hits.map(({ line }) => ({ label: `${line.code} ${line.name}`, message: `Duplica la riga ${line.code} ${line.name}` })),
    )
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
  if (hits.length !== 1) return reply(hits.length === 0 ? `No row matches "${query}".` : `Several rows match "${query}". Ask which one.`)
  const { family, line } = hits[0]!
  const index = family.lines.findIndex((item) => item.id === line.id)
  const next = index + (direction === 'up' ? -1 : 1)
  if (next < 0 || next >= family.lines.length) return reply(`That row is already at the ${direction === 'up' ? 'top' : 'bottom'}.`)
  const [moved] = family.lines.splice(index, 1)
  family.lines.splice(next, 0, moved!)
  const saved = await persist(ctx, actor, state, document)
  return reply(`Moved ${line.name} ${direction}.\n${saved.content}`)
}

const updateLine = async (ctx: TenantContext, actor: QuoteActor, state: ChatState, args: Record<string, unknown>): Promise<ToolResult> => {
  const current = requireQuote(state)
  const query = str(args.lineName) ?? ''
  const document = structuredClone(current.version.document)
  const hits = findLines(document, query)
  if (hits.length !== 1) {
    return reply(hits.length === 0 ? `No row matches "${query}".` : `Several rows match. Ask which one:\n${hits.map(({ line }) => `- ${line.code} ${line.name}`).join('\n')}`)
  }
  const { line } = hits[0]!
  const width = num(args.widthMm)
  const height = num(args.heightMm)
  if (width) line.widthMm = width
  if (height) line.heightMm = height
  const extra = num(args.extraPct)
  const discount = num(args.discountPct)
  const quantity = num(args.quantity)
  const hours = num(args.installationHours)
  const unitPrice = num(args.unitPrice)
  if (extra !== undefined) line.extraMarkupPct = extra
  if (discount !== undefined) line.discountPct = Math.min(100, Math.max(0, discount))
  if (quantity !== undefined) line.quantity = Math.max(1, Math.round(quantity))
  if (hours !== undefined) line.installationHours = hours
  const vat = str(args.vatRate)
  if (vat) {
    if (!VAT_RATES.includes(vat as VatRate)) return reply(`VAT must be one of ${VAT_RATES.join(', ')}.`)
    line.vatRate = vat as VatRate
  }
  if (unitPrice !== undefined) {
    line.priceMode = 'manual'
    line.unitPrice = unitPrice
  } else if (line.priceMode === 'catalog' && line.productLineId && (width || height)) {
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
  const manualNote = unitPrice !== undefined ? 'This row is now a manual €/pc and will not follow the catalog. ' : ''
  const saved = await persist(ctx, actor, state, document)
  return reply(`${manualNote}Updated ${line.name}.\n${saved.content}`)
}

export const quoteIdOf = (state: ChatState): string | null => state.detail?.quote.id ?? null

export const createChatState = (): ChatState => ({ detail: null, loaded: false })
