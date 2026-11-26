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

const SIZE = /(\d{2,5})\s*[x×]\s*(\d{2,5})/i

export const isRemoving = (text: string): boolean => REMOVING.test(text)

export const isNewQuoteRequest = (text: string): boolean => NEW_QUOTE.test(text)

/** Adding a catalog row, including a chip that quotes a product name. */
export const isNewRowRequest = (text: string): boolean => NEW_ROW.test(text) || /\b(aggiung\w*|add)\s+["“]/i.test(text)

/** IVA, discount, price, size, hours, extra, quantity, rename, lock, alternative, or option on an existing row. */
export const isEditRequest = (text: string): boolean => EDIT.test(text) && !isNewRowRequest(text)

export const sizesIn = (text: string): { widthMm: number; heightMm: number }[] =>
  [...text.matchAll(/(\d{2,5})\s*[x×]\s*(\d{2,5})/gi)].map((match) => ({
    widthMm: Number(match[1]),
    heightMm: Number(match[2]),
  }))

/** True only when the user typed both millimetre numbers. A prompt example does not count. */
export const userGaveSize = (userTexts: readonly string[], widthMm: number, heightMm: number): boolean =>
  userTexts.some((text) => sizesIn(text).some((size) => size.widthMm === widthMm && size.heightMm === heightMm))

export const mentionedId = (userTexts: readonly string[], id: string): boolean =>
  userTexts.some((text) => text.toLowerCase().includes(id.toLowerCase()))

export const isUuid = (value: string): boolean => UUID.test(value) && value.length === 36

export const detectLanguage = (text: string, fallback: ChatLocale): ChatLocale => {
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
  },
} as const

const ORDINALS: { pattern: RegExp; index: number }[] = [
  { pattern: /^(?:il |la |the |die )?(?:primo|prima|first|erste)(?: one| uno| una)?$/i, index: 0 },
  { pattern: /^(?:il |la |the |die )?(?:secondo|seconda|second|zweite)(?: one| uno| una)?$/i, index: 1 },
  { pattern: /^(?:il |la |the |die )?(?:terzo|terza|third|dritte)(?: one| uno| una)?$/i, index: 2 },
  { pattern: /^(?:il |la |the |die )?(?:quarto|quarta|fourth|vierte)(?: one| uno| una)?$/i, index: 3 },
  { pattern: /^(?:il |la |the |die )?(?:quinto|quinta|fifth|fünfte)(?: one| uno| una)?$/i, index: 4 },
]

/** "1", "the first", "la seconda" pick a pending chip. */
export const choiceIndex = (message: string, count: number): number | null => {
  const trimmed = message.trim()
  const number = trimmed.match(/^(\d+)\.?$/)
  if (number) {
    const index = Number(number[1]) - 1
    return index >= 0 && index < count ? index : null
  }
  const found = ORDINALS.find((item) => item.pattern.test(trimmed))
  if (!found || found.index >= count) return null
  return found.index
}

export const resolveDirectAction = (input: {
  latestUser: string
  pendingChoices?: Suggestion[]
  action?: SuggestionAction
}): SuggestionAction | null => {
  if (input.action?.tool) return input.action
  const choices = input.pendingChoices ?? []
  const index = choiceIndex(input.latestUser, choices.length)
  if (index === null) return null
  return choices[index]?.action ?? null
}

export const hasSize = (text: string): boolean => SIZE.test(text)
