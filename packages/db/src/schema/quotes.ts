import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'
import { users } from './users'

export const quoteStatusEnum = pgEnum('quote_status', ['draft', 'invoiced', 'accepted'])

/**
 * A supplier's quote (preventivo) to an end customer. Its content lives in versions
 * (`quoteVersions`): the customer, totals and status here mirror the latest version, for the
 * quotes list. The reference ("PRV-2026-014") is the quote's own and stays the same across
 * versions.
 */
export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supplierCompanyId: uuid('supplier_company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reference: text('reference').notNull(),
    // The latest version's, for the list.
    status: quoteStatusEnum('status').notNull().default('draft'),
    customerName: text('customer_name').notNull(),
    projectLocation: text('project_location'),
    totalPrice: numeric('total_price', { precision: 14, scale: 2 }).notNull().default('0'),
    latestVersion: integer('latest_version').notNull().default(1),
    /** Set when a company admin archives the quote. Null means it shows on the list. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    supplierCompanyIdx: index('quotes_supplier_company_id_idx').on(table.supplierCompanyId),
  }),
)

/**
 * One version and alternative of a quote (V1A2): the whole document as last saved. Only a draft
 * is fixed in place; an invoiced or accepted variant stays as it was, and changes go into the
 * next version of that same alternative. Prices are stored in the document as they were saved,
 * never recomputed from the live catalog on a read.
 */
export const quoteVersions = pgTable(
  'quote_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** Alternative within the version: V1A1, V1A2, … Existing rows are alternative 1. */
    alternative: integer('alternative').notNull().default(1),
    /** Optional name ("Wood", "Aluminium"). The code V1A2 is always shown as well. */
    label: text('label'),
    /** The one variant the dashboard treats as the chosen offer. At most one per quote. */
    isFinal: boolean('is_final').notNull().default(false),
    /** A variant the company wants to come back to. Any number of a quote's variants can be favorites. */
    isFavorite: boolean('is_favorite').notNull().default(false),
    status: quoteStatusEnum('status').notNull().default('draft'),
    /** A `QuoteDocument` (@schuco/contracts), validated by the API before it is stored. */
    document: jsonb('document').$type<Record<string, unknown>>().notNull(),
    totalPrice: numeric('total_price', { precision: 14, scale: 2 }).notNull().default('0'),
    /** Bumped on every save; a save names the revision it started from, so two people can't overwrite each other. */
    revision: integer('revision').notNull().default(1),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => ({
    // Loading a quote's versions, and one version by number.
    quoteVersionIdx: uniqueIndex('quote_versions_quote_id_version_alternative_idx').on(
      table.quoteId,
      table.version,
      table.alternative,
    ),
  }),
)

/**
 * Every save of every version, with the full document as saved and what changed from the save
 * before: the quote's complete change history.
 */
export const quoteRevisions = pgTable(
  'quote_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quoteVersionId: uuid('quote_version_id')
      .notNull()
      .references(() => quoteVersions.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    document: jsonb('document').$type<Record<string, unknown>>().notNull(),
    totalPrice: numeric('total_price', { precision: 14, scale: 2 }).notNull(),
    changes: jsonb('changes').$type<unknown[]>().notNull().default([]),
    /** On a version's first revision: the version it was copied from, if any. */
    fromVersion: integer('from_version'),
    /** And which alternative of that version, when the copy was an alternative or a version fork. */
    fromAlternative: integer('from_alternative'),
    savedByUserId: uuid('saved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    savedAt: timestamp('saved_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // A version's history, newest first, and one revision by number.
    versionRevisionIdx: uniqueIndex('quote_revisions_quote_version_id_revision_idx').on(table.quoteVersionId, table.revision),
  }),
)

/** A company's saved texts, offered when adding a text module to a quote's intro or closing. */
export const quoteTextTemplates = pgTable(
  'quote_text_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    html: text('html').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Listing a company's texts.
    companyIdx: index('quote_text_templates_company_id_idx').on(table.companyId),
  }),
)
