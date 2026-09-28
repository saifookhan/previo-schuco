import { z } from 'zod'

export const companyTypeSchema = z.enum(['platform', 'supplier', 'client'])

/** One company row for the super-admin companies CRUD panel. */
export const companyDtoSchema = z.object({
  id: z.string().uuid(),
  type: companyTypeSchema,
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
  type: companyTypeSchema,
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
  type: companyTypeSchema.optional(),
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
