import { index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'
import { users } from './users'

export const quoteStatusEnum = pgEnum('quote_status', ['draft', 'sent', 'accepted', 'rejected'])

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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    supplierCompanyIdx: index('quotes_supplier_company_id_idx').on(table.supplierCompanyId),
  }),
)

/**
 * One version of a quote: the whole document (intro, families with their lines, closing, print
 * settings) as last saved. Only a draft is fixed in place; a sent, accepted or rejected version
 * stays as it was, and changes go into a new version. Prices are stored in the document as they
 * were saved, never recomputed from the live catalog on a read.
 */
export const quoteVersions = pgTable(
  'quote_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
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
    quoteVersionIdx: uniqueIndex('quote_versions_quote_id_version_idx').on(table.quoteId, table.version),
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
