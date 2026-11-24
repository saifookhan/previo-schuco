import { z } from 'zod'

const optionalText = (max: number) => z.string().trim().max(max).nullable()

/**
 * The company's own details as printed on its quotes: the footer of every page shows the fiscal
 * data. `name` is the legal name (ragione sociale) and `vatNumber` the Partita IVA.
 */
export const companyProfileSchema = z.object({
  name: z.string().trim().min(1).max(300),
  vatNumber: z.string().trim().min(1).max(50),
  fiscalAddress: optionalText(500),
  fiscalCode: optionalText(50),
  /** Codice univoco (SDI). */
  sdiCode: optionalText(20),
  email: optionalText(300),
  pecEmail: optionalText(300),
  phone: optionalText(50),
})
export type CompanyProfile = z.infer<typeof companyProfileSchema>

/**
 * PUT /api/company/profile — what a company admin may change. The legal name and the VAT number
 * identify the company to its partners, so only a super-admin changes them (admin companies API).
 */
export const companyProfileUpdateSchema = companyProfileSchema.omit({ name: true, vatNumber: true })
export type CompanyProfileUpdate = z.infer<typeof companyProfileUpdateSchema>

/** A logo as a data URL (PNG, JPEG, WebP or SVG), at most ~512 KB. */
export const LOGO_MAX_BYTES = 512 * 1024
const logoDataUrlSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/, 'Logo must be a PNG, JPEG, WebP or SVG image')
  .max(Math.ceil((LOGO_MAX_BYTES * 4) / 3) + 40, 'Logo is too large (max 512 KB)')

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a color like #1E5F8C')

/** A branch (unità locale): its logo, name and contacts head the pages of the quotes it issues. */
export const businessUnitSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  primaryColor: z.string(),
  logoDataUrl: z.string().nullable(),
  /** The users who work for it (offered as the quote's sales contact). */
  userIds: z.array(z.string().uuid()),
})
export type BusinessUnit = z.infer<typeof businessUnitSchema>

export const businessUnitInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: optionalText(500),
  email: optionalText(300),
  phone: optionalText(50),
  primaryColor: hexColorSchema,
  logoDataUrl: logoDataUrlSchema.nullable(),
  userIds: z.array(z.string().uuid()).max(1000),
})
export type BusinessUnitInput = z.infer<typeof businessUnitInputSchema>

/** A company user as the quote's sales contact ("Vostro referente"). */
export const salesContactSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  businessUnitIds: z.array(z.string().uuid()),
})
export type SalesContact = z.infer<typeof salesContactSchema>

/** GET /api/company/profile */
export const companyProfileResponseSchema = z.object({
  profile: companyProfileSchema,
  businessUnits: z.array(businessUnitSchema),
  salesContacts: z.array(salesContactSchema),
})
export type CompanyProfileResponse = z.infer<typeof companyProfileResponseSchema>

/** A saved text (intro or closing module) to start a new text module from. */
export const textTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  html: z.string(),
  updatedAt: z.string().datetime(),
})
export type TextTemplate = z.infer<typeof textTemplateSchema>

export const textTemplateInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  html: z.string().max(1_000_000),
})
export type TextTemplateInput = z.infer<typeof textTemplateInputSchema>

/** PUT /api/company/sales-contacts/:userId — the phone printed next to a sales contact. */
export const salesContactInputSchema = z.object({
  phone: optionalText(50),
})
export type SalesContactInput = z.infer<typeof salesContactInputSchema>
