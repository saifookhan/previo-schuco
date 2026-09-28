import { and, eq, isNull } from 'drizzle-orm'

import type { DbLike } from '../client'
import { authTokens } from '../schema'

export interface InsertAuthTokenInput {
  userId: string
  tokenHash: string
  purpose: 'invite' | 'password_reset'
  expiresAt: Date
}

export const insertAuthToken = async (db: DbLike, input: InsertAuthTokenInput): Promise<void> => {
  await db.insert(authTokens).values(input)
}

/** Marks every still-usable token of this purpose for this user as used, without deleting the rows (kept for audit). Call before issuing a new one — an old invite/reset link must stop working once a newer one exists. */
export const invalidatePendingAuthTokens = async (
  db: DbLike,
  userId: string,
  purpose: 'invite' | 'password_reset',
): Promise<void> => {
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)))
}

export interface ValidAuthToken {
  id: string
  userId: string
  purpose: 'invite' | 'password_reset'
}

/** Looks up a token by its hash — returns it only if unused and not expired (the two things that make a token "valid" here). */
export const getValidAuthTokenByHash = async (db: DbLike, tokenHash: string): Promise<ValidAuthToken | null> => {
  const [row] = await db.select().from(authTokens).where(eq(authTokens.tokenHash, tokenHash)).limit(1)
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return null
  }
  return { id: row.id, userId: row.userId, purpose: row.purpose }
}

export const markAuthTokenUsed = async (db: DbLike, id: string): Promise<void> => {
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, id))
}
