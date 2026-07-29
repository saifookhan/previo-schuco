import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const quotes = sqliteTable('quotes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reference: text('reference').notNull().unique(),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email'),
  productType: text('product_type').notNull(),
  widthMm: integer('width_mm').notNull(),
  heightMm: integer('height_mm').notNull(),
  glazing: text('glazing').notNull(),
  security: text('security').notNull(),
  color: text('color').notNull(),
  quantity: integer('quantity').notNull(),
  subtotal: real('subtotal').notNull(),
  vatAmount: real('vat_amount').notNull(),
  total: real('total').notNull(),
  locale: text('locale').notNull().default('it'),
  createdAt: text('created_at').notNull(),
})

export const productFamilies = sqliteTable('product_families', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  quoteReference: text('quote_reference').notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  total: real('total').notNull(),
  isValid: integer('is_valid', { mode: 'boolean' }).notNull().default(true),
  validityNote: text('validity_note'),
  isAlternative: integer('is_alternative', { mode: 'boolean' }).notNull().default(false),
})

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull().unique(),
  nameEn: text('name_en').notNull(),
  nameIt: text('name_it').notNull(),
  nameDe: text('name_de').notNull(),
  baseRate: real('base_rate').notNull(),
  imageUrl: text('image_url'),
})

export type Quote = typeof quotes.$inferSelect
export type NewQuote = typeof quotes.$inferInsert
export type Product = typeof products.$inferSelect
