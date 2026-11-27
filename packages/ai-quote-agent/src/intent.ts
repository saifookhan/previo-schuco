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
    invalidSize: 'La misura non è valida. Servono larghezza e altezza in millimetri interi, maggiori di zero.',
    needBoth: 'Manca una dimensione. Indica larghezza e altezza in mm.',
    paymentsSum: 'Le percentuali non fanno 100. Completa i pagamenti: non invento il resto.',
    badTransition: 'Questa variante ha già quello stato. Puoi scegliere bozza, fatturato o accettato.',
    conflict: 'Il preventivo è stato salvato altrove. Ho ricaricato i dati: ripeti la modifica.',
    restored: 'Annullata l’ultima modifica. Ripristinata la revisione',
    noPrevious: 'Non c’è una revisione precedente da ripristinare.',
    nonsense: 'Non salvo un testo così lungo o ripetuto. Scrivi il testo da mettere nel preventivo.',
    refuse: 'Non posso ignorare le regole del preventivo, né cancellarlo senza conferma.',
    quantity: 'La quantità deve essere un numero intero compreso tra 1 e 1.000.000.',
    printUpdated: 'Impostazioni di stampa aggiornate.',
    copied: 'Preventivo copiato per',
    restoreRevision: 'Ripristina la revisione',
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
    invalidSize: 'That size is not valid. Width and height must be whole millimetres greater than zero.',
    needBoth: 'One dimension is missing. Give both width and height in mm.',
    paymentsSum: 'Those percentages do not add up to 100. Complete the payments. I will not fill in the rest.',
    badTransition: 'This variant already has that status. Choose draft, invoiced, or accepted.',
    conflict: 'The quote was saved somewhere else. I reloaded it: please retry the edit.',
    restored: 'Undid the last edit. Restored revision',
    noPrevious: 'There is no previous revision to restore.',
    nonsense: 'I will not save a long or repeated block. Send the text you want on the quote.',
    refuse: 'I cannot ignore the quote rules or delete the quote without confirmation.',
    quantity: 'Quantity must be a whole number from 1 to 1,000,000.',
    printUpdated: 'Print settings updated.',
    copied: 'Quote copied for',
    restoreRevision: 'Restore revision',
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
    invalidSize: 'Das Maß ist ungültig. Breite und Höhe müssen ganze Millimeter größer als null sein.',
    needBoth: 'Eine Seite fehlt. Gib Breite und Höhe in mm an.',
    paymentsSum: 'Die Prozente ergeben nicht 100. Ergänze die Zahlungen. Den Rest erfinde ich nicht.',
    badTransition: 'Diese Variante hat diesen Status bereits. Wähle Entwurf, fakturiert oder angenommen.',
    conflict: 'Das Angebot wurde anderswo gespeichert. Ich habe es neu geladen: bitte die Änderung wiederholen.',
    restored: 'Letzte Änderung rückgängig. Revision wiederhergestellt',
    noPrevious: 'Es gibt keine vorherige Revision zum Wiederherstellen.',
    nonsense: 'So einen langen oder wiederholten Text speichere ich nicht. Schreib den Text für das Angebot.',
    refuse: 'Ich kann die Angebotsregeln nicht ignorieren und das Angebot nicht ohne Bestätigung löschen.',
    quantity: 'Die Menge muss eine ganze Zahl zwischen 1 und 1.000.000 sein.',
    printUpdated: 'Druckeinstellungen aktualisiert.',
    copied: 'Angebot kopiert für',
    restoreRevision: 'Revision wiederherstellen',
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

/** "Also confizione", "also add …", "anche confizione": another catalog product, not an activity or a rename. */
const ANOTHER_PRODUCT = /^(?:also(?:\s+add)?|anche(?:\s+aggiung\w*)?|auch(?:\s+(?:noch|hinzuf\w*))?)\s+(.+)$/i

export const anotherProductQuery = (text: string): string | null => {
  const rest = text.trim().match(ANOTHER_PRODUCT)?.[1]?.trim()
  if (!rest) return null
  const product = stripSizes(rest).replace(/\b(mm|millimetri|millimeters?)\b/gi, ' ').replace(/\s+/g, ' ').trim()
  return product.length >= 3 ? product : null
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

const CONFIRM_WORD = /^(?:conferma|confirm|bestätigen|bestaetigen)$/i
const CANCEL_WORD = /^(?:annulla|cancel|abbrechen)$/i

export const resolveDirectAction = (input: {
  latestUser: string
  pendingChoices?: Suggestion[]
  action?: SuggestionAction
}): SuggestionAction | null => {
  if (input.action?.tool) return input.action
  const choices = input.pendingChoices ?? []
  const index = choiceIndex(input.latestUser, choices.length)
  if (index !== null) return choices[index]?.action ?? null
  const word = input.latestUser.trim()
  if (CONFIRM_WORD.test(word)) return choices.find((choice) => choice.action?.args && 'confirmToken' in choice.action.args)?.action ?? null
  if (CANCEL_WORD.test(word)) return { tool: 'cancel_action', args: {} }
  const size = sizeOnly(input.latestUser)
  if (!size) return null
  const adds = choices.filter((choice) => choice.action?.tool === 'add_product')
  const pending = adds.length === 1 ? adds[0]?.action : null
  if (!pending) return null
  return { tool: 'add_product', args: { ...pending.args, widthMm: size.widthMm, heightMm: size.heightMm } }
}

const LOOSE_SIZE = /(-?\d+(?:[.,]\d+)?)\s*(?:mm|cm|m)?\s*(?:[x×*]|\b(?:per|by)\b)\s*(-?\d+(?:[.,]\d+)?)/i

/** A pair that must not be written: decimals, zero, or a negative side. A lone number is only half a size. */
export const sizeIssue = (text: string): 'invalid' | 'partial' | null => {
  const loose = text.match(LOOSE_SIZE)
  if (loose) {
    const width = Number(loose[1]?.replace(',', '.'))
    const height = Number(loose[2]?.replace(',', '.'))
    const whole = Number.isInteger(width) && Number.isInteger(height)
    const inRange = width >= 1 && height >= 1 && width <= 99_999 && height <= 99_999
    return whole && inRange ? null : 'invalid'
  }
  if (sizesIn(text).length > 0) return null
  const onlyNumber = /^\s*\d{2,5}(?:\s*mm)?\s*$/i.test(text.trim())
  const sizeTalk = /\b(misur\w*|size|larghezza|altezza|width|height|breite|höhe|mm)\b/i.test(text)
  const numbers = text.match(/\d+(?:[.,]\d+)?/g) ?? []
  if ((onlyNumber || sizeTalk) && numbers.length === 1) return 'partial'
  return null
}

/** Percentages the user typed, such as 30% and 30%. */
export const statedPercents = (text: string): number[] =>
  [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((match) => Number(match[1]?.replace(',', '.') ?? ''))

export const percentsSumTo100 = (values: readonly number[]): boolean =>
  Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) <= 0.01

/** A long block, or the same short phrase repeated, is not a text module. */
export const isNonsenseDump = (text: string): boolean => {
  const folded = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (folded.length >= 2_000) return true
  const words = folded.split(' ').filter(Boolean)
  if (words.length < 8) return false
  const counts = new Map<string, number>()
  for (let index = 0; index <= words.length - 4; index += 1) {
    const key = words.slice(index, index + 4).join(' ')
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.values()].some((count) => count >= 3)
}

/** The user told the assistant to drop its rules or to wipe the quote without a confirm. */
export const isPromptInjection = (text: string): boolean =>
  /ignora\s+(?:le\s+|tutte\s+le\s+)?istruzioni|ignore\s+(?:all\s+|the\s+)?(?:previous|prior|above)\s+instructions|disregard\s+(?:your\s+|the\s+)?(?:previous\s+|prior\s+)?instructions|ignorier\w*\s+(?:die\s+)?(?:vorherigen\s+)?anweisungen|(?:cancella|elimina|delete|lösch\w*)\s+tutto[\s\S]{0,80}senza\s+chiedere/i.test(
    text,
  )

/** Undo the last saved edit, as opposed to cancelling a confirm chip. */
export const wantsUndo = (text: string): boolean =>
  /annulla l['’]ultima modifica|undo the last|letzte\s+(?:änderung|aenderung)\s+rückgängig/i.test(text)

/** The save just before the current one, not revision 1. */
export const wantsPreviousRevision = (text: string): boolean =>
  wantsUndo(text) || /revisione precedente|previous revision|vorherige\s+revision|torna alla revisione/i.test(text)

const STATUS_WORD = {
  it: { draft: 'bozza', invoiced: 'fatturato', accepted: 'accettato' },
  en: { draft: 'draft', invoiced: 'invoiced', accepted: 'accepted' },
  de: { draft: 'Entwurf', invoiced: 'fakturiert', accepted: 'angenommen' },
} as const

export const statusWord = (locale: ChatLocale, status: string): string => {
  const words = STATUS_WORD[locale]
  if (status === 'draft' || status === 'invoiced' || status === 'accepted') return words[status]
  return status
}

export const hasSize = (text: string): boolean => sizesIn(text).length > 0
