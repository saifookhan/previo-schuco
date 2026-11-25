process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { auditLog, companies, createDb, roles, users, withSystemTransaction } from '@schuco/db'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../src/lib/db'
import {
  CompanyProfileValidationError,
  createBusinessUnit,
  createTextTemplate,
  getCompanyProfile,
  listTextTemplates,
  removeBusinessUnit,
  removeTextTemplate,
  setSalesContactPhone,
  updateBusinessUnit,
  updateCompanyProfile,
  updateTextTemplate,
} from '../src/services/company-profile-service'

/** The company profile the printed quote takes its header and footer from, and the saved texts. */

let companyId: string
let otherCompanyId: string
let userId: string
let otherUserId: string
const actor = { actorUserId: '', actorCompanyId: '', requestId: 'test-request' }
const ctx = () => ({ effectiveCompanyId: companyId, isSuperAdmin: false })
const otherCtx = () => ({ effectiveCompanyId: otherCompanyId, isSuperAdmin: false })
const LOGO = 'data:image/png;base64,iVBORw0KGgo='

const branch = (overrides: Partial<Parameters<typeof createBusinessUnit>[2]> = {}) => ({
  name: 'Sede di Milano',
  address: 'Via Roma 1, Milano',
  email: 'milano@example.com',
  phone: '+39 02 000000',
  primaryColor: '#1E5F8C',
  logoDataUrl: LOGO,
  userIds: [userId],
  ...overrides,
})

beforeAll(async () => {
  await withSystemTransaction(getDb(), async (tx) => {
    await tx.insert(roles).values({ id: 'company-admin', name: 'Company Admin', description: 'test role' }).onConflictDoNothing({ target: roles.id })
    const rows = await tx
      .insert(companies)
      .values([
        { isSupplier: true, name: 'Profile Test Company', vatNumber: 'PROF-1' },
        { isSupplier: true, name: 'Profile Test Other', vatNumber: 'PROF-2' },
      ])
      .returning({ id: companies.id })
    ;[companyId, otherCompanyId] = rows.map((row) => row.id)
    const userRows = await tx
      .insert(users)
      .values([
        { cognitoSub: 'profile-test-user', email: 'profile-test-user@example.com', name: 'Profile User', companyId, roleId: 'company-admin', status: 'active' },
        { cognitoSub: 'profile-test-other', email: 'profile-test-other@example.com', companyId: otherCompanyId, roleId: 'company-admin', status: 'active' },
      ])
      .returning({ id: users.id })
    ;[userId, otherUserId] = userRows.map((row) => row.id)
    actor.actorUserId = userId
    actor.actorCompanyId = companyId
  })
})

afterAll(async () => {
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  await createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
    .delete(auditLog)
    .where(inArray(auditLog.effectiveCompanyId, [companyId, otherCompanyId]))
  await withSystemTransaction(getDb(), async (tx) => {
    await tx.delete(users).where(inArray(users.id, [userId, otherUserId]))
    await tx.delete(companies).where(inArray(companies.id, [companyId, otherCompanyId]))
  })
})

describe('company profile', () => {
  it('stores the fiscal data printed in the footer, but not the legal name or VAT number', async () => {
    const input = {
      fiscalAddress: 'Via Verdi 2, Milano',
      fiscalCode: 'CF0001',
      sdiCode: 'ABC1234',
      email: 'info@example.com',
      pecEmail: 'pec@example.com',
      phone: '+39 02 111111',
    }
    const saved = await updateCompanyProfile(ctx(), actor, { ...input, name: 'Someone Else S.p.A.', vatNumber: 'IT99999999999' } as typeof input)
    expect(saved!.profile).toEqual({ name: 'Profile Test Company', vatNumber: 'PROF-1', ...input })
    expect((await getCompanyProfile(ctx()))!.salesContacts).toEqual([
      { id: userId, name: 'Profile User', email: 'profile-test-user@example.com', phone: null, businessUnitIds: [] },
    ])
  })

  it('adds, changes and removes branches with their logo, colour and users', async () => {
    const created = await createBusinessUnit(ctx(), actor, branch())
    const unit = created.businessUnits.find((u) => u.name === 'Sede di Milano')!
    expect(unit).toMatchObject({ primaryColor: '#1E5F8C', logoDataUrl: LOGO, userIds: [userId] })
    expect(created.salesContacts[0].businessUnitIds).toEqual([unit.id])

    const updated = await updateBusinessUnit(ctx(), actor, unit.id, branch({ name: 'Sede di Torino', primaryColor: '#AA0000', logoDataUrl: null, userIds: [] }))
    expect(updated!.businessUnits.find((u) => u.id === unit.id)).toMatchObject({ name: 'Sede di Torino', primaryColor: '#AA0000', logoDataUrl: null, userIds: [] })

    // Another company can't change it, nor add its users to a branch.
    expect(await updateBusinessUnit(otherCtx(), actor, unit.id, branch({ userIds: [] }))).toBeNull()
    await expect(createBusinessUnit(ctx(), actor, branch({ userIds: [otherUserId] }))).rejects.toThrow(CompanyProfileValidationError)

    expect(await removeBusinessUnit(otherCtx(), actor, unit.id)).toBeNull()
    expect((await removeBusinessUnit(ctx(), actor, unit.id))!.businessUnits.some((u) => u.id === unit.id)).toBe(false)
  })

  it("sets a sales contact's phone, only for the company's own users", async () => {
    const saved = await setSalesContactPhone(ctx(), actor, userId, '+39 333 0000000')
    expect(saved!.salesContacts.find((c) => c.id === userId)!.phone).toBe('+39 333 0000000')
    expect(await setSalesContactPhone(ctx(), actor, otherUserId, '1')).toBeNull()
  })
})

describe('saved texts', () => {
  it('are kept per company, with their rich text sanitized', async () => {
    const template = await createTextTemplate(ctx(), { name: 'Condizioni', html: '<p>Pagamento a 30 gg<script>x()</script></p>' })
    expect(template.html).toBe('<p>Pagamento a 30 gg</p>')
    expect((await listTextTemplates(ctx())).map((t) => t.name)).toEqual(['Condizioni'])
    expect(await listTextTemplates(otherCtx())).toEqual([])

    expect(await updateTextTemplate(otherCtx(), template.id, { name: 'X', html: '' })).toBeNull()
    expect((await updateTextTemplate(ctx(), template.id, { name: 'Condizioni 2026', html: '<p>60 gg</p>' }))!.name).toBe('Condizioni 2026')
    expect(await removeTextTemplate(otherCtx(), template.id)).toBe(false)
    expect(await removeTextTemplate(ctx(), template.id)).toBe(true)
  })
})
