import { and, asc, eq, inArray, or } from 'drizzle-orm'

import type { DbLike } from '../client'
import { businessUnits, companies, companyConnections } from '../schema'
import { capabilitiesOf, type CompanyCapabilities } from './companies'

export interface PartnerDirectoryEntry {
  id: string
  name: string
  capabilities: CompanyCapabilities
  /** Address of the company's first branch, if any. */
  address: string | null
  branches: string[]
}

/**
 * Every active company, with its first branch's address and its branch names —
 * what the Partners page shows and searches. Reads across tenants, so call it
 * from a system transaction; return only names and addresses to the caller.
 */
export const listPartnerDirectory = async (db: DbLike): Promise<PartnerDirectoryEntry[]> => {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      isPlatform: companies.isPlatform,
      isManufacturer: companies.isManufacturer,
      isSupplier: companies.isSupplier,
      isClient: companies.isClient,
    })
    .from(companies)
    .where(eq(companies.isActive, true))
    .orderBy(asc(companies.name))
  const branchRows = await db
    .select({ companyId: businessUnits.companyId, name: businessUnits.name, address: businessUnits.address })
    .from(businessUnits)
    .innerJoin(companies, eq(businessUnits.companyId, companies.id))
    .where(eq(companies.isActive, true))
    .orderBy(asc(businessUnits.createdAt), asc(businessUnits.name))
  const branchesByCompany = new Map<string, Array<{ name: string; address: string | null }>>()
  for (const branch of branchRows) {
    const list = branchesByCompany.get(branch.companyId) ?? []
    list.push(branch)
    branchesByCompany.set(branch.companyId, list)
  }
  return rows.map((row) => {
    const branches = branchesByCompany.get(row.id) ?? []
    return {
      id: row.id,
      name: row.name,
      capabilities: capabilitiesOf(row),
      address: branches.find((b) => b.address)?.address ?? null,
      branches: branches.map((b) => b.name),
    }
  })
}

export interface CompanyConnectionRow {
  id: string
  requesterCompanyId: string
  addresseeCompanyId: string
  status: 'pending' | 'accepted'
}

const connectionColumns = {
  id: companyConnections.id,
  requesterCompanyId: companyConnections.requesterCompanyId,
  addresseeCompanyId: companyConnections.addresseeCompanyId,
  status: companyConnections.status,
}

/** Every connection and pending request `companyId` is part of, on either side. */
export const listCompanyConnections = (db: DbLike, companyId: string): Promise<CompanyConnectionRow[]> =>
  db
    .select(connectionColumns)
    .from(companyConnections)
    .where(or(eq(companyConnections.requesterCompanyId, companyId), eq(companyConnections.addresseeCompanyId, companyId)))

/** The connection or pending request between two companies, whichever asked; null when there is none. Locks the row. */
export const getCompanyConnectionForUpdate = async (
  db: DbLike,
  companyId: string,
  otherCompanyId: string,
): Promise<CompanyConnectionRow | null> => {
  const [row] = await db
    .select(connectionColumns)
    .from(companyConnections)
    .where(
      or(
        and(eq(companyConnections.requesterCompanyId, companyId), eq(companyConnections.addresseeCompanyId, otherCompanyId)),
        and(eq(companyConnections.requesterCompanyId, otherCompanyId), eq(companyConnections.addresseeCompanyId, companyId)),
      ),
    )
    .for('update')
  return row ?? null
}

/**
 * Which of `otherCompanyIds` are connected with `companyId`, locking those
 * connections until the transaction ends — so a connection can't be removed
 * between this check and a write that relies on it (removing waits instead).
 */
export const lockConnectedCompanyIds = async (
  db: DbLike,
  companyId: string,
  otherCompanyIds: string[],
): Promise<Set<string>> => {
  if (otherCompanyIds.length === 0) {
    return new Set()
  }
  const rows = await db
    .select(connectionColumns)
    .from(companyConnections)
    .where(
      and(
        eq(companyConnections.status, 'accepted'),
        or(
          and(eq(companyConnections.requesterCompanyId, companyId), inArray(companyConnections.addresseeCompanyId, otherCompanyIds)),
          and(eq(companyConnections.addresseeCompanyId, companyId), inArray(companyConnections.requesterCompanyId, otherCompanyIds)),
        ),
      ),
    )
    .for('share')
  return new Set(rows.map((row) => (row.requesterCompanyId === companyId ? row.addresseeCompanyId : row.requesterCompanyId)))
}

/** Records a request from `requesterCompanyId` and returns its id; null when the pair already has a row (saved at the same moment). */
export const insertConnectionRequest = async (
  db: DbLike,
  input: { requesterCompanyId: string; addresseeCompanyId: string; userId: string | null },
): Promise<string | null> => {
  const rows = await db
    .insert(companyConnections)
    .values({
      requesterCompanyId: input.requesterCompanyId,
      addresseeCompanyId: input.addresseeCompanyId,
      requestedByUserId: input.userId,
    })
    .onConflictDoNothing()
    .returning({ id: companyConnections.id })
  return rows[0]?.id ?? null
}

/** Marks a pending request accepted. */
export const acceptConnection = async (db: DbLike, connectionId: string, userId: string | null): Promise<void> => {
  await db
    .update(companyConnections)
    .set({ status: 'accepted', respondedByUserId: userId, respondedAt: new Date() })
    .where(eq(companyConnections.id, connectionId))
}

/** Deletes a connection or request (refused, withdrawn or removed). */
export const deleteConnection = async (db: DbLike, connectionId: string): Promise<void> => {
  await db.delete(companyConnections).where(eq(companyConnections.id, connectionId))
}
