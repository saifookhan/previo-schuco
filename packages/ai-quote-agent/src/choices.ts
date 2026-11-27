import { foldName, quotedName } from './match'

export interface CatalogChoiceLine {
  name: string
  familyId: string
  familyName: string
  version: number
}

export interface CatalogChoice {
  label: string
  message: string
  lineName: string
  familyId?: string
}

const sizeText = (size?: { widthMm: number; heightMm: number }): string =>
  size ? `, ${size.widthMm}×${size.heightMm} mm` : ''

/** Family name first, then version and a short id, so five copies of one line stay distinct on a narrow chip. */
export const familyChipLabel = (familyName: string, version: number, id: string): string => {
  const mark = `v${version} · ${id.slice(0, 8)}`
  const name = familyName.trim()
  const joined = `${name} · ${mark}`
  if (joined.length <= 90) return joined
  const room = Math.max(12, 90 - mark.length - 3)
  return `${name.slice(0, room)} · ${mark}`
}

export const lineOnlyMessage = (lineName: string, size?: { widthMm: number; heightMm: number }): string =>
  `Aggiungi "${lineName.trim()}"${sizeText(size)}`

export const familyAddMessage = (
  lineName: string,
  familyName: string,
  familyId: string,
  size?: { widthMm: number; heightMm: number },
): string => `Aggiungi "${lineName.trim()}" della famiglia "${familyName}", id ${familyId}${sizeText(size)}`

/** The line the user already picked by resending Aggiungi "…", including a trailing space inside the quotes. */
export const repeatedLineName = (latestUser: string, lineNames: readonly string[]): string | null => {
  const quoted = quotedName(latestUser)
  if (!quoted) return null
  const folded = foldName(quoted)
  const hit = lineNames.find((name) => foldName(name) === folded)
  return hit ? hit.trim() : null
}

/**
 * Different line names are the first step. One line in several families, or a resent line-only
 * Aggiungi chip, is the family step. The family step never repeats the line-only message.
 */
export const catalogStepSuggestions = (
  lines: readonly CatalogChoiceLine[],
  latestUser: string,
  size?: { widthMm: number; heightMm: number },
): { step: 'lines' | 'families'; choices: CatalogChoice[] } => {
  const names = [...new Set(lines.map((line) => line.name.trim()))]
  const repeated = repeatedLineName(latestUser, names)
  const scoped = repeated ? lines.filter((line) => foldName(line.name) === foldName(repeated)) : lines
  const scopedNames = [...new Set(scoped.map((line) => line.name.trim()))]
  if (!repeated && scopedNames.length > 1) {
    return {
      step: 'lines',
      choices: scopedNames.slice(0, 8).map((name) => ({
        label: name,
        message: lineOnlyMessage(name, size),
        lineName: name,
      })),
    }
  }
  const seen = new Set<string>()
  const choices: CatalogChoice[] = []
  for (const line of scoped) {
    if (seen.has(line.familyId)) continue
    seen.add(line.familyId)
    const lineName = line.name.trim()
    choices.push({
      label: familyChipLabel(line.familyName, line.version, line.familyId),
      message: familyAddMessage(lineName, line.familyName, line.familyId, size),
      lineName,
      familyId: line.familyId,
    })
    if (choices.length === 8) break
  }
  return { step: 'families', choices }
}
