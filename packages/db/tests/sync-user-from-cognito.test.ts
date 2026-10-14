import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Db } from '../src/client'
import { companies, roles, users } from '../src/schema'
import {
  createInvitedUser,
  markInviteFailed,
  syncUserFromCognito,
  withSystemTransaction,
} from '../src/queries/users'
import { getTestDb } from './helpers'

/**
 * Regression test: a user stuck in 'invite_failed' (the Cognito call
 * errored client-side after actually succeeding server-side — see
 * `inviteUser` in apps/api/src/services/users-service.ts) must still be
 * able to log in and recover to 'active', the same as a plain 'invited'
 * user. Before this fix, `syncUserFromCognito`'s email-match backfill only
 * flipped status to 'active' from 'invited', permanently locking out
 * anyone who actually completed Cognito signup after a false-negative
 * invite failure.
 */

let db: Db
let companyId: string

beforeAll(async () => {
  db = getTestDb()

  await withSystemTransaction(db, async (tx) => {
    await tx.insert(roles).values({
      id: 'company-admin',
      name: 'Company Admin',
      description: 'test role',
    }).onConflictDoNothing({ target: roles.id })

    const [c] = await tx
      .insert(companies)
      .values({ isClient: true, name: 'Sync Test Co', vatNumber: 'SYNCTEST' })
      .returning({ id: companies.id })
    companyId = c.id
  })
})

afterAll(async () => {
  await withSystemTransaction(db, async (tx) => {
    await tx.delete(users).where(eq(users.companyId, companyId))
    await tx.delete(companies).where(inArray(companies.id, [companyId]))
  })
})

describe('syncUserFromCognito recovers an invite_failed user', () => {
  it('flips invite_failed to active on a real first login, not just invited', async () => {
    const invited = await withSystemTransaction(db, (tx) =>
      createInvitedUser(tx, {
        email: 'invite-failed-recovers@example.com',
        companyId,
        roleIds: ['company-admin'],
      }),
    )

    await withSystemTransaction(db, (tx) => markInviteFailed(tx, invited.id))

    const profile = await withSystemTransaction(db, (tx) =>
      syncUserFromCognito(tx, {
        cognitoSub: 'sync-test-recovered-sub',
        email: 'invite-failed-recovers@example.com',
      }),
    )

    expect(profile?.status).toBe('active')
    expect(profile?.cognitoSub).toBe('sync-test-recovered-sub')
  })

  it('never reactivates an explicitly inactive user', async () => {
    const invited = await withSystemTransaction(db, (tx) =>
      createInvitedUser(tx, {
        email: 'stays-inactive@example.com',
        companyId,
        roleIds: ['company-admin'],
      }),
    )
    await withSystemTransaction(db, (tx) =>
      tx.update(users).set({ status: 'inactive' }).where(eq(users.id, invited.id)),
    )

    const profile = await withSystemTransaction(db, (tx) =>
      syncUserFromCognito(tx, {
        cognitoSub: 'sync-test-inactive-sub',
        email: 'stays-inactive@example.com',
      }),
    )

    expect(profile?.status).toBe('inactive')
  })
})
