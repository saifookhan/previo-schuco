import { XMLParser } from 'fast-xml-parser'
import JSZip from 'jszip'

export interface EmbeddedImage {
  /** 0-indexed row the image is anchored to in the worksheet. */
  row: number
  data: Buffer
  /** File extension including the dot, e.g. ".jpg" — taken from the media filename inside the .xlsx. */
  extension: string
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Extracts images embedded (pasted directly into cells, not linked by
 * URL) in one sheet of an .xlsx — the `xlsx` package only reads cell
 * values, never drawings, so this reads the file as the zip archive an
 * .xlsx actually is and walks the OOXML relationship chain by hand:
 * `workbook.xml` (sheet name -> sheet file) -> the sheet's own `.rels`
 * (-> its drawing file) -> the drawing XML (anchor row + image
 * relationship id) -> the drawing's `.rels` (relationship id -> media
 * filename) -> `xl/media/*` (the actual bytes).
 *
 * Returned images are sorted by anchor row ascending. There's no
 * reliable text label attached to an image inside the XML (its "name"
 * attribute is just the original filename, e.g. "image2.jpg", not
 * "Immagine_1") — callers that need to match images to specific
 * "Immagine_N" fields from a Label/Value sheet should zip this array
 * against those labels in row order, which is how the one real workbook
 * this was built against lays them out (confirmed, not assumed for that
 * file — but still a positional heuristic for any other workbook).
 * @param buffer - Raw .xlsx bytes
 * @param sheetName - Sheet to extract images from, e.g. "Product Family"
 */
export const extractEmbeddedImages = async (
  buffer: Buffer,
  sheetName: string,
): Promise<EmbeddedImage[]> => {
  const zip = await JSZip.loadAsync(buffer)

  const workbookXml = await readXml(zip, 'xl/workbook.xml')
  const workbookRelsXml = await readXml(zip, 'xl/_rels/workbook.xml.rels')
  if (!workbookXml || !workbookRelsXml) {
    return []
  }

  const sheetEntries = asArray(workbookXml.workbook?.sheets?.sheet)
  const sheetEntry = sheetEntries.find((entry: Record<string, string>) => entry['@_name'] === sheetName)
  if (!sheetEntry) {
    return []
  }
  const sheetRId = sheetEntry['@_r:id']

  const workbookRels = asArray(workbookRelsXml.Relationships?.Relationship)
  const sheetRel = workbookRels.find((rel: Record<string, string>) => rel['@_Id'] === sheetRId)
  if (!sheetRel) {
    return []
  }
  // e.g. "worksheets/sheet3.xml" -> "sheet3.xml"
  const sheetFileName = sheetRel['@_Target'].split('/').pop()!

  const sheetRelsXml = await readXml(zip, `xl/worksheets/_rels/${sheetFileName}.rels`)
  if (!sheetRelsXml) {
    return []
  }
  const sheetRels = asArray(sheetRelsXml.Relationships?.Relationship)
  const drawingRel = sheetRels.find((rel: Record<string, string>) => rel['@_Type']?.endsWith('/drawing'))
  if (!drawingRel) {
    return []
  }
  const drawingFileName = drawingRel['@_Target'].split('/').pop()!

  const drawingXml = await readXml(zip, `xl/drawings/${drawingFileName}`)
  const drawingRelsXml = await readXml(zip, `xl/drawings/_rels/${drawingFileName}.rels`)
  if (!drawingXml || !drawingRelsXml) {
    return []
  }
  const drawingRels = asArray(drawingRelsXml.Relationships?.Relationship)

  const anchors = [
    ...asArray(drawingXml['xdr:wsDr']?.['xdr:oneCellAnchor']),
    ...asArray(drawingXml['xdr:wsDr']?.['xdr:twoCellAnchor']),
  ]

  const images: EmbeddedImage[] = []
  for (const anchor of anchors) {
    const row = Number(anchor['xdr:from']?.['xdr:row'] ?? 0)
    const embedId = anchor['xdr:pic']?.['xdr:blipFill']?.['a:blip']?.['@_r:embed']
    if (!embedId) continue

    const mediaRel = drawingRels.find((rel: Record<string, string>) => rel['@_Id'] === embedId)
    if (!mediaRel) continue

    // e.g. "../media/image2.jpg" -> "xl/media/image2.jpg"
    const mediaPath = `xl/media/${mediaRel['@_Target'].split('/').pop()}`
    const file = zip.file(mediaPath)
    if (!file) continue

    const data = await file.async('nodebuffer')
    const extension = `.${mediaPath.split('.').pop()}`
    images.push({ row, data, extension })
  }

  return images.sort((a, b) => a.row - b.row)
}

const readXml = async (zip: JSZip, path: string): Promise<Record<string, any> | null> => {
  const file = zip.file(path)
  if (!file) {
    return null
  }
  const text = await file.async('text')
  return xmlParser.parse(text)
}
