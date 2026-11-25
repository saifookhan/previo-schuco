import { sql } from 'drizzle-orm'
import { boolean, check, pgTable, pgView, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * A company on the platform. What it can do is a set of independent
 * capabilities, not a single type — one company can be both a
 * manufacturer and a supplier. Manufacturer = builds/owns a catalog;
 * supplier = sells (creates quotes from a linked manufacturer's published
 * catalog); client = buys. Platform = the PREVIO/Schüco operator itself.
 */
export const companies = pgTable(
  'companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    isPlatform: boolean('is_platform').notNull().default(false),
    isManufacturer: boolean('is_manufacturer').notNull().default(false),
    isSupplier: boolean('is_supplier').notNull().default(false),
    isClient: boolean('is_client').notNull().default(false),
    name: text('name').notNull(),
    vatNumber: text('vat_number').notNull(),
    // Printed in the footer of the company's quotes (with `name` as the legal name and `vatNumber` as the Partita IVA).
    fiscalAddress: text('fiscal_address'),
    fiscalCode: text('fiscal_code'),
    /** Codice univoco (SDI) for e-invoicing. */
    sdiCode: text('sdi_code'),
    email: text('email'),
    pecEmail: text('pec_email'),
    phone: text('phone'),
    /** Deactivated instead of deleted — a company has users/catalog/quotes cascading off it, so admin-panel "delete" is a reversible toggle, not a DELETE statement. */
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'companies_has_capability',
      sql`${table.isPlatform} OR ${table.isManufacturer} OR ${table.isSupplier} OR ${table.isClient}`,
    ),
  ],
)

/**
 * Names only — the one view of other companies a tenant may read: itself,
 * companies it shares families with (either direction), and owners of
 * families it can see. Defined in 0001_rls.sql (runs with the owner's rights,
 * so it exposes id + name without opening up the companies row itself).
 */
export const companyDirectory = pgView('company_directory', {
  id: uuid('id').notNull(),
  name: text('name').notNull(),
}).existing()
