process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { auditLog, companies, createDb, roles, users, withSystemTransaction } from '@schuco/db'
import { countFamilyChanges, type FamilyChangeNode } from '@schuco/contracts'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { parseProductFamilyWorkbook } from '../src/lib/excel-import'
import { getDb } from '../src/lib/db'
import {
  ExcelImportError,
  compareProductFamilyVersions,
  createNewVersionFromExcel,
  getProductFamilyDetail,
  importProductFamilyFromExcel,
} from '../src/services/product-families-service'
import { previewQuotePosition } from '../src/services/quotes-service'

/**
 * The v2 Excel template, over the example workbooks the business sent
 * (`tests/fixtures/excel-v2`): a supplier family ("MyBox", V01 and four V02
 * variants, each changing one kind of thing) and two families a company
 * built for itself. Every expected value was read from the files first.
 */

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures/excel-v2', name))
const file = (name: string) => ({ buffer: fixture(name), originalName: name })

describe('parsing a v2 workbook', () => {
  it('reads the family note and distributor, and the brand from its own row', () => {
    const { family } = parseProductFamilyWorkbook(fixture('mybox-v01.xlsx'))
    expect(family).toMatchObject({ family_name: 'Cassonetto Coibentato MyBox Revo', brand: 'Alpac', distributor: 'Colfert' })
    expect(family.note).toMatch(/^Link a /)
  })

  it('reads MinValue on lines and MinValue, discount, markup and hours on options', () => {
    const parsed = parseProductFamilyWorkbook(fixture('mybox-v02-economics.xlsx'))
    expect(parsed.productLines.find((l) => l.minValue != null)).toMatchObject({ minValue: 300 })
    const belt = parsed.characteristics.find((c) => c.name === 'Kit guida cinghia')!
    expect(belt.subCharacters).toEqual([
      expect.objectContaining({ name: 'SI', listinoAcquisto: 20, minValue: 100, discountPct: 0, markupPct: 1, installationHoursPerUnit: 3 }),
      expect.objectContaining({ name: 'NO', priceListType: '2xAltezza x [€/m]', listinoAcquisto: 3, discountPct: 0.05, markupPct: 1.1 }),
    ])
  })

  it('treats "NO" in the Relations sheet as not offered', () => {
    const v1 = parseProductFamilyWorkbook(fixture('mybox-v01.xlsx'))
    const economics = parseProductFamilyWorkbook(fixture('mybox-v02-economics.xlsx'))
    const offers = (relations: typeof v1.relations, line: string) =>
      relations.filter((r) => r.productLineName === line).map((r) => r.characteristicName)
    expect(offers(v1.relations, 'Cassonetto MyBox Revo Light profondità 150')).toContain('Cielino')
    expect(offers(economics.relations, 'Cassonetto MyBox Revo Light profondità 150')).not.toContain('Cielino')
  })

  it('imports lines with a blank purchase price at 0 (a family priced through its options)', () => {
    const parsed = parseProductFamilyWorkbook(fixture('finestre-for-itself.xlsx'))
    expect(parsed.productLines).toHaveLength(11)
    expect(parsed.productLines.every((l) => l.listinoAcquisto === 0)).toBe(true)
  })

  it('rejects an option whose price table sheet is missing, naming it', () => {
    expect(() => parseProductFamilyWorkbook(fixture('mybox-v02-add.xlsx'))).toThrow(
      /Option "Cielino: Cielino e guide FERRO" uses the price table "C1_4"/,
    )
  })

  it('still reads a v1 workbook, with no v2 values on its options', () => {
    const parsed = parseProductFamilyWorkbook(readFileSync(join(__dirname, 'fixtures/product-family-sample.xlsx')))
    expect(parsed.family.brand).toBe('Tendital')
    const option = parsed.characteristics.flatMap((c) => c.subCharacters)[0]
    expect(option).toMatchObject({ minValue: null, discountPct: null, markupPct: null, installationHoursPerUnit: null })
  })
})

let supplierId = ''
let actorUserId = ''
const actor = { actorUserId: '', actorCompanyId: '', requestId: 'test-request' }
const ctx = () => ({ effectiveCompanyId: supplierId, isSuperAdmin: false })
const usable = { publish: true, readyForInvoicing: true }

beforeAll(async () => {
  await withSystemTransaction(getDb(), async (tx) => {
    await tx.insert(roles).values({ id: 'company-admin', name: 'Company Admin', description: 'test role' }).onConflictDoNothing({ target: roles.id })
    const [supplier] = await tx
      .insert(companies)
      .values({ isManufacturer: true, isSupplier: true, name: 'Excel v2 Test Supplier', vatNumber: 'XV2-SUP' })
      .returning({ id: companies.id })
    supplierId = supplier.id
    const [user] = await tx
      .insert(users)
      .values({ cognitoSub: 'excel-v2-test', email: 'excel-v2-test@example.com', companyId: supplierId, roleId: 'company-admin', status: 'active' })
      .returning({ id: users.id })
    actorUserId = user.id
  })
  actor.actorUserId = actorUserId
  actor.actorCompanyId = supplierId
})

afterAll(async () => {
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
  await superuserDb.delete(auditLog).where(inArray(auditLog.effectiveCompanyId, [supplierId]))
  await withSystemTransaction(getDb(), async (tx) => {
    await tx.delete(users).where(eq(users.id, actorUserId))
    await tx.delete(companies).where(eq(companies.id, supplierId))
  })
})

/** Every change in a tree as "item: field" / "item (added)", for readable assertions. */
const flatten = (nodes: FamilyChangeNode[], owner = ''): string[] =>
  nodes.flatMap((node) => {
    if (node.type === 'section') return flatten(node.children, owner)
    if (node.type === 'item') return node.kind ? [`${node.name} (${node.kind})`] : flatten(node.children, node.name)
    if (node.type === 'link') return [`${owner} offers ${node.name} (${node.kind})`]
    return [`${owner || 'family'}: ${node.field}`]
  })

describe('importing v2 workbooks and comparing their versions', () => {
  let v1Id = ''
  beforeAll(async () => {
    v1Id = (await importProductFamilyFromExcel(ctx(), actor, supplierId, file('mybox-v01.xlsx'))).id
  })

  it('stores the family note and distributor, and each option\'s own values', async () => {
    const detail = (await getProductFamilyDetail(ctx(), v1Id))!
    expect(detail.family).toMatchObject({ brand: 'Alpac', distributor: 'Colfert' })
    const posa = detail.characteristics.find((c) => c.name === 'Inclusa (a ore)')!
    // Markup 1 → stored "out of 100" like a line's.
    expect(posa).toMatchObject({ discountPct: '0.0000', markupPct: '100.0000', installationHoursPerUnit: '0.0000', minValue: null })
  })

  it('refuses the "Add" example: its new option names a price table the workbook lacks', async () => {
    await expect(createNewVersionFromExcel(ctx(), actor, v1Id, file('mybox-v02-add.xlsx'))).rejects.toThrow(ExcelImportError)
  })

  it('"Cancel": the removed lines, option and option values are removed', async () => {
    const v2 = await createNewVersionFromExcel(ctx(), actor, v1Id, file('mybox-v02-cancel.xlsx'))
    const { changes, counts } = (await compareProductFamilyVersions(ctx(), v1Id, v2.id))!
    // 2 lines, the whole "Posa" option (not also once per line that offered it) and 3 option values.
    expect(counts).toEqual({ added: 0, removed: 6, economic: 0, description: 0 })
    expect(flatten(changes)).toEqual([
      'Cassonetto MyBox Revo Light profondità 230 (removed)',
      expect.stringMatching(/^Macchina VMC modello COMPACT versione FULL .* \(removed\)$/),
      'Cielino e guide in PVC per filo muro interno (removed)',
      'NO (removed)',
      'SI (removed)',
      'Posa (removed)',
    ])
  })

  it('"Change Descriptions": renames are description changes, not removed + added', async () => {
    const v2 = await createNewVersionFromExcel(ctx(), actor, v1Id, file('mybox-v02-descriptions.xlsx'))
    const { changes, counts } = (await compareProductFamilyVersions(ctx(), v1Id, v2.id))!
    expect(counts.added).toBe(0)
    expect(counts.removed).toBe(0)
    expect(counts.economic).toBe(0)
    expect(flatten(changes)).toEqual(
      expect.arrayContaining([
        'family: name',
        'Cassonetto MyBoxTRE Revo Light profondità 300: name',
        'Cassonetto MyBoxTRE Revo Light profondità 300: unitName',
        'Barra: name',
      ]),
    )
  })

  it('"Change Economics": prices, minimums, discounts, markups and hours are economic changes', async () => {
    const v2 = await createNewVersionFromExcel(ctx(), actor, v1Id, file('mybox-v02-economics.xlsx'))
    const { changes } = (await compareProductFamilyVersions(ctx(), v1Id, v2.id))!
    const flat = flatten(changes)
    expect(flat).toEqual(
      expect.arrayContaining([
        'Cassonetto MyBox Revo Light profondità 230: minValue',
        'Cassonetto MyBox Revo Light profondità 80: priceTable',
        'SI: minValue',
        'SI: installationHoursPerUnit',
        'NO: discountPct',
        'NO: markupPct',
        'NO: formula',
        'Cassonetto MyBox Revo Light profondità 150 offers Cielino (removed)',
      ]),
    )
    expect(countFamilyChanges(changes).description).toBe(0)
  })
})

describe('pricing a position from a v2 family', () => {
  it('adds the options\' installation hours to the line\'s and keeps the installation at least its MinValue', async () => {
    const family = await importProductFamilyFromExcel(ctx(), actor, supplierId, file('finestre-for-itself.xlsx'), usable)
    const detail = (await getProductFamilyDetail(ctx(), family.id))!
    const line = detail.lines.find((l) => Number(l.installationHoursPerUnit) === 3)!
    const pick = (main: string, sub: string) => {
      const parent = detail.characteristics.find((c) => !c.parentId && c.name === main)!
      const child = detail.characteristics.find((c) => c.parentId === parent.id && c.name === sub)!
      return { characteristicId: parent.id, subCharacteristicId: child.id }
    }
    const price = (selections: ReturnType<typeof pick>[]) =>
      previewQuotePosition(ctx(), {
        productFamilyId: family.id,
        productLineId: line.id,
        quantity: 1,
        widthMm: 1000,
        heightMm: 1400,
        characteristicSelections: selections,
      })
    const installation = pick('Posa in opera', 'Inclusa (a Ore)')
    // 3 h × 50 €/h = 150 (above the 140 minimum); with RC3 (+2 h): 5 h × 50 = 250.
    expect((await price([installation])).characteristics[0].price).toBe(150)
    const withRc3 = await price([pick('Classe antieffrazione', 'RC3'), installation])
    expect(withRc3.characteristics.map((c) => c.price)).toEqual([0, 250])
  })

  it('prices each option at its own discount and markup, and the line at the position\'s', async () => {
    const family = await importProductFamilyFromExcel(ctx(), actor, supplierId, file('aria-luce-for-itself.xlsx'), usable)
    const detail = (await getProductFamilyDetail(ctx(), family.id))!
    const guides = detail.characteristics.find((c) => !c.parentId && c.name === 'Guide')!
    const guide = detail.characteristics.find((c) => c.parentId === guides.id && c.name.startsWith('Guide base'))!
    const line = detail.lines.find((l) => detail.relations.some((r) => r.productLineId === l.id && r.characteristicId === guides.id))!
    const preview = await previewQuotePosition(ctx(), {
      productFamilyId: family.id,
      productLineId: line.id,
      quantity: 1,
      widthMm: 1000,
      heightMm: 1500,
      characteristicSelections: [{ characteristicId: guides.id, subCharacteristicId: guide.id }],
    })
    // Guide: 2 × 1.5 m × 7.15 = 21.45 (above its 15 minimum), at its own 30% discount and 150% markup.
    expect(preview.characteristics[0].price).toBeCloseTo(21.45, 6)
    const lineFinal = preview.lineUnitPrice * (1 - preview.discountPct / 100) * (preview.extraMarkupPct / 100)
    expect(preview.finalPrice).toBeCloseTo(lineFinal + 21.45 * 0.7 * 1.5, 6)
  })
})
