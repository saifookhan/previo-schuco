import { z } from 'zod'

/** What a company can do. Any combination, but at least one. */
export const companyCapabilitiesSchema = z
  .object({
    platform: z.boolean(),
    manufacturer: z.boolean(),
    supplier: z.boolean(),
    client: z.boolean(),
  })
  .refine((c) => c.platform || c.manufacturer || c.supplier || c.client, {
    message: 'A company needs at least one capability',
  })

export type CompanyCapabilities = z.infer<typeof companyCapabilitiesSchema>

/** One company row for the super-admin companies CRUD panel. */
export const companyDtoSchema = z.object({
  id: z.string().uuid(),
  capabilities: companyCapabilitiesSchema,
  name: z.string(),
  vatNumber: z.string(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type CompanyDto = z.infer<typeof companyDtoSchema>

/** GET /api/admin/companies response. */
export const companiesListResponseSchema = z.object({
  companies: z.array(companyDtoSchema),
})

export type CompaniesListResponse = z.infer<typeof companiesListResponseSchema>

/** POST /api/admin/companies request body. */
export const createCompanyRequestSchema = z.object({
  capabilities: companyCapabilitiesSchema,
  name: z.string().min(1),
  vatNumber: z.string().min(1),
})

export type CreateCompanyRequest = z.infer<typeof createCompanyRequestSchema>

/** POST /api/admin/companies response. */
export const createCompanyResponseSchema = z.object({
  company: companyDtoSchema,
})

export type CreateCompanyResponse = z.infer<typeof createCompanyResponseSchema>

/** PATCH /api/admin/companies/:id request body — every field optional, only given ones change. */
export const updateCompanyRequestSchema = z.object({
  capabilities: companyCapabilitiesSchema.optional(),
  name: z.string().min(1).optional(),
  vatNumber: z.string().min(1).optional(),
})

export type UpdateCompanyRequest = z.infer<typeof updateCompanyRequestSchema>

/** PATCH /api/admin/companies/:id response. */
export const updateCompanyResponseSchema = z.object({
  company: companyDtoSchema,
})

export type UpdateCompanyResponse = z.infer<typeof updateCompanyResponseSchema>

/** PATCH /api/admin/companies/:id/active request body. */
export const setCompanyActiveRequestSchema = z.object({
  isActive: z.boolean(),
})

export type SetCompanyActiveRequest = z.infer<typeof setCompanyActiveRequestSchema>
