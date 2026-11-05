import PDFDocument from 'pdfkit'

import { FAMILY_CHANGE_KINDS, type FamilyChangeKind, type FamilyChangeNode } from '@schuco/contracts'
import type { QuoteDetail } from '@schuco/db'

const EUR = (n: number): string =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)

const COLUMN_X = { pos: 50, qty: 90, desc: 130, dims: 320, m2: 400, total: 460 } as const

/** widthMm/heightMm come through as "1000.00"-style numeric strings — no reason to show fraction-of-a-millimeter precision on the PDF. */
const formatMm = (value: string): string => String(Math.round(Number(value)))

const CHANGE_LABELS: Record<FamilyChangeKind, { label: string; color: string }> = {
  added: { label: 'Added', color: '#13865d' },
  removed: { label: 'Removed', color: '#c23534' },
  economic: { label: 'Price changes', color: '#9a6a00' },
  description: { label: 'Text changes', color: '#1f5fae' },
}

/** A family's version and what changed since the version before it (see `getFamilyVersionNotes`). */
export interface FamilyVersionNote {
  version: number
  /** Null for a first version (an import, or a copy — a copy is never compared with its original here, which may be another supplier's). */
  previousVersion: number | null
  changes: FamilyChangeNode[]
}

/** How many names one line lists before "and N more". */
const NAMES_PER_LINE = 6

/** Rounded first, so a tiny change never reads "-0.0%". */
const formatPct = (value: number): string => {
  const rounded = Math.round(value * 10) / 10 || 0
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`
}

/**
 * The changes of a family version as one line per kind: what was added or removed, and which
 * items had price or text changes (with the % range over all of an item's price tables). Each
 * name once.
 */
export const familyChangeLines = (changes: FamilyChangeNode[]): { kind: FamilyChangeKind; text: string }[] => {
  // Per kind, per name: the % range of its price tables, if any.
  const names = new Map<FamilyChangeKind, Map<string, { min: number; max: number } | null>>()
  const note = (kind: FamilyChangeKind, name: string, range: { min: number; max: number } | null = null) => {
    const byName = names.get(kind) ?? new Map<string, { min: number; max: number } | null>()
    const seen = byName.get(name)
    byName.set(name, seen && range ? { min: Math.min(seen.min, range.min), max: Math.max(seen.max, range.max) } : (seen ?? range))
    names.set(kind, byName)
  }
  const walk = (node: FamilyChangeNode, owner: string) => {
    if (node.type === 'section') {
      node.children.forEach((child) => walk(child, node.id === 'details' ? 'Family details' : owner))
    } else if (node.type === 'item') {
      const name = owner ? `${owner} › ${node.name}` : node.name
      if (node.kind) note(node.kind, name)
      else node.children.forEach((child) => walk(child, name))
    } else if (node.type === 'link') {
      note(node.kind, owner ? `${owner}: ${node.name}` : node.name)
    } else {
      const { minPct, maxPct } = node.priceTable ?? {}
      note(node.kind, owner || 'Family details', minPct != null && maxPct != null ? { min: minPct, max: maxPct } : null)
    }
  }
  changes.forEach((node) => walk(node, ''))
  return FAMILY_CHANGE_KINDS.flatMap((kind) => {
    const entries = [...(names.get(kind) ?? [])].map(([name, range]) => {
      if (!range) return name
      // Compared as shown: -4.81% and -4.79% are both "-4.8%".
      const [low, high] = [formatPct(range.min), formatPct(range.max)]
      return `${name} (${low === high ? low : `${low} to ${high}`})`
    })
    if (!entries.length) return []
    const shown = entries.slice(0, NAMES_PER_LINE).join(', ')
    const more = entries.length - NAMES_PER_LINE
    return [{ kind, text: more > 0 ? `${shown} and ${more} more` : shown }]
  })
}

/**
 * Renders a quote as a PDF (structure modeled on a real supplier quote
 * document: header with client details, one section per product family
 * with its positions table, then a totals/payment-terms summary).
 * Positions are grouped by family in the order they were added. Every
 * name shown (family, line, characteristic) is read from the position's
 * own snapshot, not re-joined against the live catalog — a later catalog
 * rename never changes an already-issued quote. The one exception is
 * `versionNotes`: each family heading carries its version and, under it,
 * what changed since the version before, read from the catalog under the
 * caller's RLS (see `getFamilyVersionNotes`).
 * @param detail - Quote with positions (from `getQuoteDetail`)
 * @param versionNotes - Per family id, from `getFamilyVersionNotes`; a family without one gets no version line
 */
export const renderQuotePdf = async (
  detail: QuoteDetail,
  versionNotes: Map<string, FamilyVersionNote> = new Map(),
): Promise<Buffer> => {
  const { quote, positions } = detail

  const doc = new PDFDocument({ margin: 50, size: 'A4' })
  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  const finished = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

  // --- Header ---
  doc.fontSize(18).font('Helvetica-Bold').text(`Quote ${quote.reference}`)
  doc.fontSize(10).font('Helvetica').fillColor('#555').text(quote.status.toUpperCase())
  doc.moveDown(1.2)

  doc.fillColor('#000').fontSize(10)
  const headerTop = doc.y
  doc.font('Helvetica-Bold').text('Customer', 50, headerTop)
  doc.font('Helvetica').text(quote.customerName, 50, doc.y)
  if (quote.customerFiscalCode) doc.text(quote.customerFiscalCode, 50)
  if (quote.customerAddress) doc.text(quote.customerAddress, 50)
  if (quote.customerCity) doc.text(quote.customerCity, 50)

  doc.font('Helvetica-Bold').text('Date', 350, headerTop)
  doc.font('Helvetica').text(new Date(quote.createdAt).toLocaleDateString('it-IT'), 350, doc.y)
  if (quote.projectLocation) {
    doc.moveDown(0.3).font('Helvetica-Bold').text('Project', 350)
    doc.font('Helvetica').text(quote.projectLocation, 350)
  }

  doc.moveDown(1.5)
  if (quote.introText) {
    doc.fontSize(9).fillColor('#333').text(quote.introText, 50, doc.y, { width: 495 })
    doc.moveDown(1)
  }
  doc.fillColor('#000')

  // --- Positions, grouped by product family ---
  const positionsByFamily = new Map<string, typeof positions>()
  for (const position of positions) {
    const list = positionsByFamily.get(position.productFamilyId) ?? []
    list.push(position)
    positionsByFamily.set(position.productFamilyId, list)
  }

  for (const familyPositions of positionsByFamily.values()) {
    if (doc.y > 680) doc.addPage()

    doc.moveDown(0.5)
    // Explicit x=50: without it, .text() continues from wherever the last
    // write left the cursor — which, after a table's last row, is the price
    // column's x (COLUMN_X.total) from its `{ align: 'right' }` call. A
    // second (or later) family's heading would then render squeezed into
    // that narrow trailing column instead of the full page width.
    const { productFamilyId, productFamilyName } = familyPositions[0]
    const versionNote = versionNotes.get(productFamilyId)
    const heading = versionNote ? `${productFamilyName} (v${versionNote.version})` : productFamilyName
    doc.fontSize(13).font('Helvetica-Bold').text(heading, 50, doc.y, { width: 495 })
    doc.moveDown(0.3)
    if (versionNote?.previousVersion != null) {
      const lines = familyChangeLines(versionNote.changes)
      doc.fontSize(8).font('Helvetica').fillColor('#555')
      doc.text(
        lines.length
          ? `Changes in version ${versionNote.version} since version ${versionNote.previousVersion}:`
          : `No changes in version ${versionNote.version} since version ${versionNote.previousVersion}.`,
        50,
        doc.y,
        { width: 495 },
      )
      for (const { kind, text } of lines) {
        const { label, color } = CHANGE_LABELS[kind]
        doc.font('Helvetica-Bold').fillColor(color).text(`${label}: `, 58, doc.y, { width: 487, continued: true })
        doc.font('Helvetica').fillColor('#333').text(text)
      }
      doc.fillColor('#000').moveDown(0.5)
    }

    const tableTop = doc.y
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#555')
    doc.text('Pos', COLUMN_X.pos, tableTop)
    doc.text('Qty', COLUMN_X.qty, tableTop)
    doc.text('Description', COLUMN_X.desc, tableTop)
    doc.text('B×H [mm]', COLUMN_X.dims, tableTop)
    doc.text('M²', COLUMN_X.m2, tableTop)
    doc.text('Total', COLUMN_X.total, tableTop)
    doc
      .moveTo(50, tableTop + 12)
      .lineTo(545, tableTop + 12)
      .strokeColor('#ccc')
      .stroke()
    doc.fillColor('#000')

    let y = tableTop + 18
    for (const position of familyPositions) {
      if (y > 720) {
        doc.addPage()
        y = 50
      }
      const characteristicsText = position.characteristics
        .map((sel) => `${sel.characteristicName}: ${sel.subCharacteristicName}`)
        .join(', ')
      const descriptionText = [position.productLineName, characteristicsText].filter(Boolean).join(' — ')

      doc.fontSize(9).font('Helvetica')
      doc.text(position.positionCode, COLUMN_X.pos, y, { width: 35 })
      doc.text(String(position.quantity), COLUMN_X.qty, y, { width: 35 })
      const descHeight = doc.heightOfString(descriptionText, { width: 190 })
      doc.text(descriptionText, COLUMN_X.desc, y, { width: 190 })
      doc.text(`${formatMm(position.widthMm)}×${formatMm(position.heightMm)}`, COLUMN_X.dims, y, { width: 75 })
      doc.text(Number(position.totalM2).toFixed(2), COLUMN_X.m2, y, { width: 55 })
      doc.font('Helvetica-Bold').text(EUR(Number(position.finalPrice)), COLUMN_X.total, y, { width: 85, align: 'right' })

      y += Math.max(descHeight, 14) + 8
    }
    doc.y = y
  }

  // --- Summary ---
  if (doc.y > 650) doc.addPage()
  doc.moveDown(1)
  doc.moveTo(350, doc.y).lineTo(545, doc.y).strokeColor('#000').stroke()
  doc.moveDown(0.3)
  doc.fontSize(12).font('Helvetica-Bold').text(`Total (excl. VAT): ${EUR(Number(quote.totalPrice))}`, 350, doc.y, {
    width: 195,
    align: 'right',
  })
  doc.moveDown(1)
  doc.fontSize(9).font('Helvetica').fillColor('#333')
  // Explicit x=50 for the same reason as the family heading above — the
  // preceding Total line was written at x=350 with align:'right'.
  doc.text(`Quote valid for ${quote.validityDays} days from issue date.`, 50, doc.y, { width: 495 })
  if (quote.paymentTerms) {
    doc.moveDown(0.3)
    doc.text(`Payment terms: ${quote.paymentTerms}`, 50, doc.y, { width: 495 })
  }

  doc.end()
  return finished
}
