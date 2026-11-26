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

/** True when every word of the query appears in the name, or the name contains the whole query. */
export const nameMatches = (name: string, query: string): boolean => {
  const foldedName = foldName(name)
  const foldedQuery = foldName(query)
  if (!foldedQuery) return true
  if (foldedName.includes(foldedQuery)) return true
  const tokens = foldedQuery.split(' ').filter((token) => token.length > 1)
  return tokens.length > 0 && tokens.every((token) => foldedName.includes(token))
}
