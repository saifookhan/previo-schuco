import type { Suggestion, SuggestionAction } from './types'

export type ChatLocale = 'it' | 'en' | 'de'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** A row edit. "Aggiungi un ricarico" is an edit; "aggiungi una riga" is not. */
const EDIT =
  /\b(iva|vat|scont\w*|discount|prezzo|price|€\/pc|misur\w*|size|or[ae]\b|hours|stunden|ricaric\w*|extra(?:\s*%)?|quantit\w*|qty|q\.?ty|pezzi|rinomin\w*|rename|blocc\w*|lock(?:ed)?|alternativ\w*|opzion\w*|option)\b/i

const NEW_ROW =
  /\b(aggiung\w*\s+una\s+riga|nuova\s+riga|aggiungi\s+prodotto|add\s+product|add(?:\s+a)?(?:\s+new)?\s+row|neue\s+zeile)\b/i

const NEW_QUOTE = /\b(nuovo\s+preventivo|new\s+quote|neues\s+angebot|crea(?:re)?\s+un\s+nuovo\s+preventivo)\b/i

const REMOVING = /\b(elimina\w*|rimuov\w*|delete|remove|togli\w*|lösch\w*|entfern\w*)\b/i

/** Width × height: 2500x500, 2500 x 500, 2500X500, 2500×500, 2500*500, 2500 per 500, 2500 by 500, optional mm. */
const SIZE_SOURCE = String.raw`(\d{2,5})\s*(?:mm)?\s*(?:[x×*]|\b(?:per|by)\b)\s*(\d{2,5})\s*(?:mm)?`
const sizePattern = (): RegExp => new RegExp(SIZE_SOURCE, 'gi')

export const isRemoving = (text: string): boolean => REMOVING.test(text)

export const isNewQuoteRequest = (text: string): boolean => NEW_QUOTE.test(text)

/** Adding a catalog row, including a chip that quotes a product name. */
export const isNewRowRequest = (text: string): boolean => NEW_ROW.test(text) || /\b(aggiung\w*|add)\s+["“]/i.test(text)

/** IVA, discount, price, size, hours, extra, quantity, rename, lock, alternative, or option on an existing row. */
export const isEditRequest = (text: string): boolean => EDIT.test(text) && !isNewRowRequest(text)

export const sizesIn = (text: string): { widthMm: number; heightMm: number }[] =>
  [...text.matchAll(sizePattern())].map((match) => ({
    widthMm: Number(match[1]),
    heightMm: Number(match[2]),
  }))

/** Remove every size so a product query does not have to contain 2000x2000. */
export const stripSizes = (text: string): string => text.replace(sizePattern(), ' ').replace(/\s+/g, ' ').trim()

/** True only when the user typed both millimetre numbers. A prompt example does not count. */
export const userGaveSize = (userTexts: readonly string[], widthMm: number, heightMm: number): boolean =>
  userTexts.some((text) => sizesIn(text).some((size) => size.widthMm === widthMm && size.heightMm === heightMm))

const finite = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

/**
 * The size for this turn. Numbers from the tool count only when the user typed them.
 * If the tool omitted both, the last size in the conversation is used, in any accepted form.
 */
export const sizeForTurn = (
  userTexts: readonly string[],
  width: unknown,
  height: unknown,
): { widthMm: number; heightMm: number } | undefined => {
  const combined = (typeof width === 'string' ? sizesIn(width)[0] : undefined) ?? (typeof height === 'string' ? sizesIn(height)[0] : undefined)
  if (combined) return userGaveSize(userTexts, combined.widthMm, combined.heightMm) ? combined : undefined
  const widthMm = finite(width)
  const heightMm = finite(height)
  if (widthMm && heightMm) return userGaveSize(userTexts, widthMm, heightMm) ? { widthMm, heightMm } : undefined
  if (widthMm || heightMm) return undefined
  return userTexts.flatMap((text) => sizesIn(text)).at(-1)
}

export const mentionedId = (userTexts: readonly string[], id: string): boolean =>
  userTexts.some((text) => text.toLowerCase().includes(id.toLowerCase()))

export const isUuid = (value: string): boolean => UUID.test(value) && value.length === 36

export const detectLanguage = (text: string, fallback: ChatLocale): ChatLocale => {
  if (choiceIndex(text, 32) !== null || sizeOnly(text)) return fallback
  const score = (pattern: RegExp) => text.match(pattern)?.length ?? 0
  const italian = score(
    /\b(aggiungi|quale|riga|righe|preventivo|famiglia|misura|sconto|quantità|cliente|bozza|altezza|larghezza|il|la|per|una|della|cambia|metti|elimina|rimuovi|nota|pagament\w*|inviato)\b/gi,
  )
  const german = score(/\b(und|der|die|das|hinzuf\w*|zeile|angebot|breite|höhe|bitte|nicht|für|eine)\b/gi)
  const english = score(/\b(the|add|quote|row|rows|width|height|please|which|set|change|remove|delete|family|price|discount)\b/gi)
  const best = Math.max(italian, german, english)
  if (best === 0) return fallback
  if (italian === best) return 'it'
  if (german === best) return 'de'
  return 'en'
}

export const languageName = (locale: ChatLocale): string => (locale === 'it' ? 'Italian' : locale === 'de' ? 'German' : 'English')

export const phrases = {
  it: {
    which: 'Quale?',
    whichFamily: 'Quale famiglia?',
    whichDepth: 'Quale profondità?',
    whichRow: 'Quale riga?',
    needSize: 'Indica larghezza × altezza in mm.',
    added: 'Riga aggiunta',
    updated: 'Riga aggiornata',
    nothing: 'Nessuna modifica.',
    confirm: 'Conferma',
    cancel: 'Annulla',
    confirmAsk: 'Confermi questa modifica?',
    cancelled: 'Annullato. Nessuna modifica.',
    onQuote: 'Questa è una riga del preventivo. Usa update_line, non il catalogo.',
    total: 'Totale IVA esclusa',
    draft: 'bozza',
    expired: 'scaduto',
    cannotAdd: 'non aggiungibile',
    notOnQuote: 'Quella riga non è nel preventivo',
    notOnQuoteFamily: 'Quella famiglia non è nel preventivo',
    noTemplate: 'Nessun testo salvato con quel nome.',
    confirmInvalid: 'La conferma non è valida. Nessuna modifica.',
    noSwitch: 'Nessuna famiglia scaduta da aggiornare.',
    hiddenNone: 'Nessuna bozza o listino scaduto corrisponde.',
  },
  en: {
    which: 'Which one?',
    whichFamily: 'Which family?',
    whichDepth: 'Which depth?',
    whichRow: 'Which row?',
    needSize: 'Give the width × height in mm.',
    added: 'Row added',
    updated: 'Row updated',
    nothing: 'Nothing changed.',
    confirm: 'Confirm',
    cancel: 'Cancel',
    confirmAsk: 'Confirm this change?',
    cancelled: 'Cancelled. Nothing was changed.',
    onQuote: 'This is a row on the quote. Call update_line, not the catalog.',
    total: 'Total ex VAT',
    draft: 'draft',
    expired: 'expired',
    cannotAdd: 'cannot add',
    notOnQuote: 'That row is not on the quote',
    notOnQuoteFamily: 'That family is not on the quote',
    noTemplate: 'No saved text with that name.',
    confirmInvalid: 'That confirmation is not valid. Nothing was changed.',
    noSwitch: 'There is no expired family to update.',
    hiddenNone: 'No draft or expired price list matches.',
  },
  de: {
    which: 'Welche?',
    whichFamily: 'Welche Familie?',
    whichDepth: 'Welche Tiefe?',
    whichRow: 'Welche Zeile?',
    needSize: 'Breite × Höhe in mm angeben.',
    added: 'Zeile hinzugefügt',
    updated: 'Zeile aktualisiert',
    nothing: 'Nichts geändert.',
    confirm: 'Bestätigen',
    cancel: 'Abbrechen',
    confirmAsk: 'Diese Änderung bestätigen?',
    cancelled: 'Abgebrochen. Nichts wurde geändert.',
    onQuote: 'Das ist eine Zeile im Angebot. update_line aufrufen, nicht den Katalog.',
    total: 'Summe ohne MwSt.',
    draft: 'Entwurf',
    expired: 'abgelaufen',
    cannotAdd: 'nicht hinzufügbar',
    notOnQuote: 'Diese Zeile ist nicht im Angebot',
    notOnQuoteFamily: 'Diese Familie ist nicht im Angebot',
    noTemplate: 'Kein gespeicherter Text mit diesem Namen.',
    confirmInvalid: 'Die Bestätigung ist ungültig. Nichts wurde geändert.',
    noSwitch: 'Keine abgelaufene Familie zum Aktualisieren.',
    hiddenNone: 'Kein Entwurf und keine abgelaufene Preisliste passt.',
  },
} as const

const ORDINALS: { pattern: RegExp; index: number }[] = [
  { pattern: /^(?:il |la |the |die )?(?:primo|prima|first|erste)(?: one| uno| una)?$/i, index: 0 },
  { pattern: /^(?:il |la |the |die )?(?:secondo|seconda|second|zweite)(?: one| uno| una)?$/i, index: 1 },
  { pattern: /^(?:il |la |the |die )?(?:terzo|terza|third|dritte)(?: one| uno| una)?$/i, index: 2 },
  { pattern: /^(?:il |la |the |die )?(?:quarto|quarta|fourth|vierte)(?: one| uno| una)?$/i, index: 3 },
  { pattern: /^(?:il |la |the |die )?(?:quinto|quinta|fifth|fünfte)(?: one| uno| una)?$/i, index: 4 },
]

/** "1", "the first", "la prima" pick a pending chip. Punctuation at the end still counts. */
export const choiceIndex = (message: string, count: number): number | null => {
  const trimmed = message.trim().replace(/[.!?)]+$/g, '').trim()
  const number = trimmed.match(/^(\d+)\.?$/)
  if (number) {
    const index = Number(number[1]) - 1
    return index >= 0 && index < count ? index : null
  }
  const found = ORDINALS.find((item) => item.pattern.test(trimmed))
  if (!found || found.index >= count) return null
  return found.index
}

/** A message that is only a width × height, such as "2000x2000" or "1000 × 300 mm". */
export const sizeOnly = (text: string): { widthMm: number; heightMm: number } | null => {
  const trimmed = text.trim()
  const sizes = sizesIn(trimmed)
  if (sizes.length !== 1) return null
  const rest = stripSizes(trimmed).replace(/\b(mm|millimetri|millimeters?)\b/gi, ' ').trim()
  return rest.length === 0 ? (sizes[0] ?? null) : null
}

/** The user asked to see draft and expired families, not to add a current one. */
export const wantsHiddenCatalog = (text: string): boolean =>
  /bozz\w*|listini?\s+scadut\w*|scadut\w*|expired|\bdrafts?\b|include hidden/i.test(text)

const ALL_ROWS = /\b(tutte le righe|all rows|whole quote|intero preventivo|alle zeilen|ogni riga)\b/i
const TARGET_NOISE =
  /\b(metti|imposta|set|change|cambia\w*|aggiung\w*|apply|applica\w*|sconto|discount|iva|vat|exempt|esente|prezzo|price|misura|size|ore|hours|stunden|installation|installazione|posa|ricarico|extra|quantit\w*|qty|q\.?ty|pezzi|rinomina\w*|rename|blocca\w*|lock(?:ed)?|alternativ\w*|elimina\w*|rimuov\w*|delete|remove|togli\w*|riga|righe|row|rows|zeile|sulla|sul|sull|alla|al|di|del|della|dei|the|of|to|a|an|un|una|per|in|su|euro|pc|famiglia|family|mark|as|la|il|lo|le|make|description|descrizione|copy|copia)\b/gi

/** The row or family the user named in an edit or a removal. "all rows" has no single target. */
export const namedTarget = (text: string): string | null => {
  if (ALL_ROWS.test(text)) return null
  if (!isEditRequest(text) && !isRemoving(text) && !/\bfamigli|\bfamily\b/i.test(text)) return null
  const pos = text.match(/\bpos(?:izione)?\s*\d+\b/i)
  if (pos) return pos[0]
  const rowNum = text.match(/\b(?:riga|row|zeile)\s+\d+\b/i)
  if (rowNum) return rowNum[0]
  const quoted = text.match(/["“]([^"”]+)["”]/)?.[1]?.trim()
  if (quoted) return quoted
  const cleaned = text
    .replace(/\d+(?:[.,]\d+)?\s*%/g, ' ')
    .replace(sizePattern(), ' ')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, ' ')
    .replace(TARGET_NOISE, ' ')
    .replace(/[%€]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+-\s+/g, ' ')
    .trim()
  return cleaned.length >= 3 ? cleaned : null
}

export const resolveDirectAction = (input: {
  latestUser: string
  pendingChoices?: Suggestion[]
  action?: SuggestionAction
}): SuggestionAction | null => {
  if (input.action?.tool) return input.action
  const choices = input.pendingChoices ?? []
  const index = choiceIndex(input.latestUser, choices.length)
  if (index !== null) return choices[index]?.action ?? null
  const size = sizeOnly(input.latestUser)
  if (!size) return null
  const adds = choices.filter((choice) => choice.action?.tool === 'add_product')
  const pending = adds.length === 1 ? adds[0]?.action : null
  if (!pending) return null
  return { tool: 'add_product', args: { ...pending.args, widthMm: size.widthMm, heightMm: size.heightMm } }
}

export const hasSize = (text: string): boolean => sizesIn(text).length > 0
