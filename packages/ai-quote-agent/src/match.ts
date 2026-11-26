/** Fold accents and case so "Profondità" matches "profondita". */
export const foldName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const SYNONYM_GROUPS = [['zanzariera', 'insect screen', 'insektenschutz', 'moustiquaire']]

/** Extra queries when the user used a known synonym. */
export const expandQuery = (query: string): string[] => {
  const folded = foldName(query)
  const extras = new Set<string>([query.trim()])
  for (const group of SYNONYM_GROUPS) {
    const foldedGroup = group.map(foldName)
    if (foldedGroup.some((term) => folded.includes(term))) {
      for (const term of group) extras.add(term)
    }
  }
  return [...extras].filter(Boolean)
}

/** Words that show up in a pasted label but are not part of the catalog name. */
const FILLER = new Set([
  'desc',
  'description',
  'copy',
  'copia',
  'version',
  'versione',
  'famiglia',
  'family',
  'prodotto',
  'product',
  'riga',
  'usa',
])

const queryTokens = (query: string): string[] =>
  foldName(query)
    .split(' ')
    .filter((token) => token.length > 1 && !FILLER.has(token))

const editDistance = (left: string, right: string): number => {
  const prev = Array.from({ length: right.length + 1 }, (_, index) => index)
  const next = Array.from({ length: right.length + 1 }, () => 0)
  for (let i = 1; i <= left.length; i += 1) {
    next[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = next[j]
  }
  return prev[right.length] ?? 0
}

/** A query word matches a catalog word when it is contained, a prefix, or one or two edits away. */
const tokenMatches = (foldedName: string, token: string): boolean => {
  if (foldedName.includes(token)) return true
  return foldedName.split(' ').some((word) => {
    if (word.length >= 4 && token.length >= 4 && (token.startsWith(word) || word.startsWith(token))) return true
    const limit = Math.max(word.length, token.length) >= 8 ? 2 : Math.max(word.length, token.length) >= 5 ? 1 : 0
    return limit > 0 && editDistance(word, token) <= limit
  })
}

/** "pos 1", "posizione 1", and "1" are the Pos column, not a product name. */
export const positionQuery = (query: string): string | null => {
  const folded = foldName(query)
  const labeled = folded.match(/^(?:pos(?:ition|izione)?|riga|zeile|row)\s*(\d+)$/)
  const digits = labeled?.[1] ?? (/^\d+$/.test(folded) ? folded : null)
  if (!digits) return null
  return digits.replace(/^0+/, '') || '0'
}

const positionDigits = (code: string): string => code.replace(/\D/g, '').replace(/^0+/, '') || '0'

/** True when the query names this row's Pos, such as "pos 1" for code "1" or "P01". */
export const samePosition = (code: string, query: string): boolean => {
  const wanted = positionQuery(query)
  return wanted !== null && positionDigits(code) === wanted
}

/** True when the meaningful words of the query appear in the name. "Revost" still matches "Revo". */
export const nameMatches = (name: string, query: string): boolean => {
  const foldedName = foldName(name)
  const foldedQuery = foldName(query)
  if (!foldedQuery) return true
  if (foldedName.includes(foldedQuery)) return true
  const tokens = queryTokens(query)
  return tokens.length > 0 && tokens.every((token) => tokenMatches(foldedName, token))
}
