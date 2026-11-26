import { foldName } from './match'

export interface ActivityPlacement {
  id: string
  description: string
  included: boolean
  enabled: boolean
}

export type ActivityAction = 'added' | 'updated' | 'unchanged'

/** Add an activity, or move the same description between Included and Not included. */
export const placeActivity = (
  rows: ActivityPlacement[],
  input: ActivityPlacement,
): { rows: ActivityPlacement[]; action: ActivityAction } => {
  const folded = foldName(input.description)
  const index = rows.findIndex((row) => foldName(row.description) === folded)
  if (index === -1) return { rows: [...rows, input], action: 'added' }
  const current = rows[index]!
  if (current.included === input.included && current.enabled === input.enabled) return { rows, action: 'unchanged' }
  const next = rows.slice()
  next[index] = { ...current, included: input.included, enabled: input.enabled }
  return { rows: next, action: 'updated' }
}
