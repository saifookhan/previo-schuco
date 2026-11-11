/**
 * What changed between two versions of a product family, as a tree:
 * section (details / product lines / options) → item (a line, an option, a sub-option) → field.
 * Every change is one of four kinds: something was added, something was removed, a price-related
 * value changed ("economic"), or a text/setting changed ("description").
 *
 * Each version is a fresh import with its own row ids, so items are matched by name. A renamed
 * line therefore shows as one removed and one added.
 */

export type FamilyChangeKind = 'added' | 'removed' | 'economic' | 'description'

export const FAMILY_CHANGE_KINDS: readonly FamilyChangeKind[] = ['added', 'removed', 'economic', 'description']

export type FamilyChangeSectionId = 'details' | 'lines' | 'options'

/** Fields compared between versions; the web translates them. */
export type FamilyChangeField =
  | 'name'
  | 'technicalName'
  | 'category'
  | 'brand'
  | 'description1'
  | 'description2'
  | 'note'
  | 'distributor'
  | 'hasPriceList'
  | 'priceValidFrom'
  | 'priceValidTo'
  | 'description'
  | 'unitName'
  | 'unitSymbol'
  | 'isApplicable'
  | 'formula'
  | 'value'
  | 'minValue'
  | 'discountPct'
  | 'markupPct'
  | 'installationHoursPerUnit'
  | 'priceSource'
  | 'priceTable'

/** A width × height price table compared cell by cell (sizes matched by value, not position). */
export interface PriceTableDiff {
  /** Every width / height in either version, ascending. */
  widths: number[]
  heights: number[]
  /** Only the cells that differ; `null` = no price for that size in that version. */
  cells: { width: number; height: number; before: number | null; after: number | null }[]
  /** Cells priced in the newer version. */
  pricedCells: number
  /** Smallest and largest % change among cells priced in both versions; null when none changed. */
  minPct: number | null
  maxPct: number | null
}

export type FamilyChangeNode =
  | { type: 'section'; id: FamilyChangeSectionId; children: FamilyChangeNode[] }
  /** A line, option or sub-option. `kind` is set when the whole item was added or removed; otherwise `children` say what changed in it. */
  | { type: 'item'; id: string; name: string; kind?: 'added' | 'removed'; children: FamilyChangeNode[] }
  | {
      type: 'field'
      id: string
      field: FamilyChangeField
      kind: 'economic' | 'description'
      before: string | null
      after: string | null
      priceTable?: PriceTableDiff
    }
  /** An option a product line started or stopped offering (the workbook's "Relations" sheet). */
  | { type: 'link'; id: string; name: string; kind: 'added' | 'removed' }

export type FamilyChangeCounts = Record<FamilyChangeKind, number>

type Numeric = string | number

/** The parts of a family version the comparison reads — the family detail response has them all. */
export interface FamilyVersionSnapshot {
  family: {
    name: string
    technicalName: string | null
    category: string | null
    brand: string | null
    description1: string | null
    description2: string | null
    /** v2 template fields; absent or null on older families. */
    note?: string | null
    distributor?: string | null
    hasPriceList: boolean
    priceValidFrom: string | null
    priceValidTo: string | null
  }
  lines: {
    id: string
    name: string
    description: string | null
    formula: string
    value: Numeric
    pricingMatrixId: string | null
    minValue?: Numeric | null
    unitName: string
    unitSymbol: string
    discountPct: Numeric
    markupPct: Numeric
    installationHoursPerUnit: Numeric
    sortOrder: number
  }[]
  characteristics: {
    id: string
    parentId: string | null
    name: string
    isApplicable: boolean
    formula: string | null
    value: Numeric | null
    pricingMatrixId: string | null
    /** v2 options only. */
    minValue?: Numeric | null
    discountPct?: Numeric | null
    markupPct?: Numeric | null
    installationHoursPerUnit?: Numeric | null
    sortOrder: number
  }[]
  matrices: { id: string; widths: number[]; heights: number[]; matrix: (number | null)[][] }[]
  relations: { productLineId: string; characteristicId: string }[]
}

type Matrix = FamilyVersionSnapshot['matrices'][number]
type Line = FamilyVersionSnapshot['lines'][number]
type Characteristic = FamilyVersionSnapshot['characteristics'][number]

const text = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** `'12.5000'` and `12.5` are the same price. */
const number = (value: Numeric | null | undefined): string | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? String(parsed) : String(value)
}

const matchKey = (name: string) => name.trim().toLowerCase()

/**
 * Pairs items by name, in their sort order. Two items with the same name in one version are
 * paired with the same-named items of the other version in order. Then an item only in the
 * older version and one only in the newer at the same place (`sortOrder`: the Excel row or
 * column) are paired too — the item was renamed.
 */
const pairByName = <T extends { name: string; sortOrder: number }>(older: T[], newer: T[]) => {
  const keyed = (items: T[]) => {
    const seen = new Map<string, number>()
    return [...items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => {
        const base = matchKey(item.name)
        const occurrence = seen.get(base) ?? 0
        seen.set(base, occurrence + 1)
        // A control character can't be part of a typed name, so "Frame" twice never collides with a "Frame 1".
        return { key: occurrence ? `${base}\u0001${occurrence}` : base, item }
      })
  }
  const olderByKey = new Map(keyed(older).map(({ key, item }) => [key, item]))
  const pairs: { key: string; older?: T; newer?: T }[] = []
  for (const { key, item } of keyed(newer)) {
    pairs.push({ key, older: olderByKey.get(key), newer: item })
    olderByKey.delete(key)
  }
  for (const [key, item] of olderByKey) {
    pairs.push({ key, older: item })
  }
  // A removed and an added item at the same place (Excel row or column) is one item renamed.
  const addedAt = new Map(pairs.filter((p) => !p.older).map((p) => [p.newer!.sortOrder, p]))
  return pairs.filter((pair) => {
    if (pair.newer) return true
    const renamed = addedAt.get(pair.older!.sortOrder)
    if (!renamed) return true
    addedAt.delete(pair.older!.sortOrder)
    renamed.older = pair.older
    return false
  })
}

/** % change from `before` to `after` (callers skip a zero `before`). */
export const pctChange = (before: number, after: number): number => ((after - before) / Math.abs(before)) * 100

/** Compares two price tables size by size; null when every price is the same. */
export const diffPriceTables = (older: Matrix, newer: Matrix): PriceTableDiff | null => {
  const priceAt = (m: Matrix) => {
    const prices = new Map<string, number>()
    m.heights.forEach((height, hi) =>
      m.widths.forEach((width, wi) => {
        const price = m.matrix[hi]?.[wi]
        if (price !== null && price !== undefined) prices.set(`${width}x${height}`, price)
      }),
    )
    return prices
  }
  const before = priceAt(older)
  const after = priceAt(newer)
  const widths = [...new Set([...older.widths, ...newer.widths])].sort((a, b) => a - b)
  const heights = [...new Set([...older.heights, ...newer.heights])].sort((a, b) => a - b)

  const cells: PriceTableDiff['cells'] = []
  let minPct: number | null = null
  let maxPct: number | null = null
  for (const height of heights) {
    for (const width of widths) {
      const key = `${width}x${height}`
      const b = before.get(key) ?? null
      const a = after.get(key) ?? null
      if (b === a) continue
      cells.push({ width, height, before: b, after: a })
      if (b !== null && a !== null && b !== 0) {
        const pct = pctChange(b, a)
        minPct = minPct === null ? pct : Math.min(minPct, pct)
        maxPct = maxPct === null ? pct : Math.max(maxPct, pct)
      }
    }
  }
  return cells.length ? { widths, heights, cells, pricedCells: after.size, minPct, maxPct } : null
}

const field = (
  id: string,
  name: FamilyChangeField,
  kind: 'economic' | 'description',
  before: string | null,
  after: string | null,
): FamilyChangeNode[] => (before === after ? [] : [{ type: 'field', id: `${id}:${name}`, field: name, kind, before, after }])

/**
 * How a line or option is priced: a fixed value / formula, or a price table.
 * Switching between the two is one change; otherwise the value or each table cell is compared.
 */
const pricingChanges = (
  id: string,
  older: { formula: string | null; value: Numeric | null; pricingMatrixId: string | null },
  newer: typeof older,
  olderMatrices: Map<string, Matrix>,
  newerMatrices: Map<string, Matrix>,
): FamilyChangeNode[] => {
  const changes = field(id, 'formula', 'economic', text(older.formula), text(newer.formula))
  const olderTable = older.pricingMatrixId ? olderMatrices.get(older.pricingMatrixId) : undefined
  const newerTable = newer.pricingMatrixId ? newerMatrices.get(newer.pricingMatrixId) : undefined
  if (olderTable && newerTable) {
    const priceTable = diffPriceTables(olderTable, newerTable)
    if (priceTable) {
      changes.push({ type: 'field', id: `${id}:priceTable`, field: 'priceTable', kind: 'economic', before: null, after: null, priceTable })
    }
  } else if (olderTable || newerTable) {
    changes.push({
      type: 'field',
      id: `${id}:priceSource`,
      field: 'priceSource',
      kind: 'economic',
      before: olderTable ? 'table' : number(older.value),
      after: newerTable ? 'table' : number(newer.value),
    })
  } else {
    changes.push(...field(id, 'value', 'economic', number(older.value), number(newer.value)))
  }
  return changes
}

/** A rename (items paired by place); the same name in another case or spacing is no change. */
const renamed = (id: string, older: { name: string }, newer: { name: string }): FamilyChangeNode[] =>
  matchKey(older.name) === matchKey(newer.name) ? [] : field(id, 'name', 'description', text(older.name), text(newer.name))

const itemNode = (
  key: string,
  name: string,
  kind: 'added' | 'removed' | undefined,
  children: FamilyChangeNode[],
): FamilyChangeNode[] => (kind || children.length ? [{ type: 'item', id: key, name, kind, children }] : [])

/**
 * Compares two versions of a family, older first. Returns only the sections that changed,
 * so an empty array means the two versions are the same.
 */
export const diffFamilyVersions = (older: FamilyVersionSnapshot, newer: FamilyVersionSnapshot): FamilyChangeNode[] => {
  const olderMatrices = new Map(older.matrices.map((m) => [m.id, m]))
  const newerMatrices = new Map(newer.matrices.map((m) => [m.id, m]))

  const of = older.family
  const nf = newer.family
  const details: FamilyChangeNode[] = [
    ...field('family', 'name', 'description', text(of.name), text(nf.name)),
    ...field('family', 'technicalName', 'description', text(of.technicalName), text(nf.technicalName)),
    ...field('family', 'category', 'description', text(of.category), text(nf.category)),
    ...field('family', 'brand', 'description', text(of.brand), text(nf.brand)),
    ...field('family', 'distributor', 'description', text(of.distributor), text(nf.distributor)),
    ...field('family', 'note', 'description', text(of.note), text(nf.note)),
    ...field('family', 'description1', 'description', text(of.description1), text(nf.description1)),
    ...field('family', 'description2', 'description', text(of.description2), text(nf.description2)),
    ...field('family', 'hasPriceList', 'economic', String(of.hasPriceList), String(nf.hasPriceList)),
    ...field('family', 'priceValidFrom', 'economic', of.priceValidFrom, nf.priceValidFrom),
    ...field('family', 'priceValidTo', 'economic', of.priceValidTo, nf.priceValidTo),
  ]

  // Options (and sub-options per option) paired by name, then by place for a rename.
  const subOptions = (snapshot: FamilyVersionSnapshot, parentId: string | undefined) =>
    parentId ? snapshot.characteristics.filter((c) => c.parentId === parentId) : []
  const optionPairs = pairByName<Characteristic>(
    older.characteristics.filter((c) => !c.parentId),
    newer.characteristics.filter((c) => !c.parentId),
  ).map((pair) => ({
    ...pair,
    subs: pair.older && pair.newer ? pairByName<Characteristic>(subOptions(older, pair.older.id), subOptions(newer, pair.newer.id)) : [],
  }))

  // The options each line offers (the "Relations" sheet), keyed by the newer name, so a renamed option is no change here.
  // Only options in both versions: one added or removed as a whole is already that one change.
  const newerNameOf = new Map<string, string>()
  for (const { older: o, newer: n } of optionPairs) if (o && n) newerNameOf.set(o.id, n.name)
  const inBoth = new Set([...newerNameOf.values()].map(matchKey))
  const offeredOptions = (snapshot: FamilyVersionSnapshot, nameOf: (c: Characteristic) => string) => {
    const byId = new Map(snapshot.characteristics.map((c) => [c.id, c]))
    const byLine = new Map<string, Map<string, string>>()
    for (const relation of snapshot.relations) {
      const option = byId.get(relation.characteristicId)
      if (!option) continue
      const offered = byLine.get(relation.productLineId) ?? new Map<string, string>()
      const name = nameOf(option)
      offered.set(matchKey(name), name)
      byLine.set(relation.productLineId, offered)
    }
    return byLine
  }
  const olderOffered = offeredOptions(older, (c) => newerNameOf.get(c.id) ?? c.name)
  const newerOffered = offeredOptions(newer, (c) => c.name)

  const lines = pairByName<Line>(older.lines, newer.lines).flatMap(({ key, older: o, newer: n }) => {
    const id = `line:${key}`
    if (!o || !n) return itemNode(id, (o ?? n)!.name, o ? 'removed' : 'added', [])
    const before = olderOffered.get(o.id) ?? new Map<string, string>()
    const after = newerOffered.get(n.id) ?? new Map<string, string>()
    const links: FamilyChangeNode[] = [
      ...[...after].filter(([k]) => inBoth.has(k) && !before.has(k)).map(([k, name]): FamilyChangeNode => ({ type: 'link', id: `${id}:offers:${k}`, name, kind: 'added' })),
      ...[...before].filter(([k]) => inBoth.has(k) && !after.has(k)).map(([k, name]): FamilyChangeNode => ({ type: 'link', id: `${id}:offers:${k}`, name, kind: 'removed' })),
    ]
    return itemNode(id, n.name, undefined, [
      ...renamed(id, o, n),
      ...field(id, 'description', 'description', text(o.description), text(n.description)),
      ...field(id, 'unitName', 'description', text(o.unitName), text(n.unitName)),
      ...field(id, 'unitSymbol', 'description', text(o.unitSymbol), text(n.unitSymbol)),
      ...pricingChanges(id, o, n, olderMatrices, newerMatrices),
      ...field(id, 'minValue', 'economic', number(o.minValue), number(n.minValue)),
      ...field(id, 'discountPct', 'economic', number(o.discountPct), number(n.discountPct)),
      ...field(id, 'markupPct', 'economic', number(o.markupPct), number(n.markupPct)),
      ...field(id, 'installationHoursPerUnit', 'economic', number(o.installationHoursPerUnit), number(n.installationHoursPerUnit)),
      ...links,
    ])
  })

  const optionChanges = (id: string, o: Characteristic, n: Characteristic) => [
    ...renamed(id, o, n),
    ...field(id, 'isApplicable', 'description', String(o.isApplicable), String(n.isApplicable)),
    ...pricingChanges(id, o, n, olderMatrices, newerMatrices),
    ...field(id, 'minValue', 'economic', number(o.minValue), number(n.minValue)),
    ...field(id, 'discountPct', 'economic', number(o.discountPct), number(n.discountPct)),
    ...field(id, 'markupPct', 'economic', number(o.markupPct), number(n.markupPct)),
    ...field(id, 'installationHoursPerUnit', 'economic', number(o.installationHoursPerUnit), number(n.installationHoursPerUnit)),
  ]
  const options = optionPairs.flatMap(({ key, older: o, newer: n, subs }) => {
    const id = `option:${key}`
    if (!o || !n) return itemNode(id, (o ?? n)!.name, o ? 'removed' : 'added', [])
    const subChanges = subs.flatMap(({ key: subKey, older: so, newer: sn }) => {
      const subId = `${id}›${subKey}`
      if (!so || !sn) return itemNode(subId, (so ?? sn)!.name, so ? 'removed' : 'added', [])
      return itemNode(subId, sn.name, undefined, optionChanges(subId, so, sn))
    })
    return itemNode(id, n.name, undefined, [...optionChanges(id, o, n), ...subChanges])
  })

  const sections: FamilyChangeNode[] = []
  if (details.length) sections.push({ type: 'section', id: 'details', children: details })
  if (lines.length) sections.push({ type: 'section', id: 'lines', children: lines })
  if (options.length) sections.push({ type: 'section', id: 'options', children: options })
  return sections
}

/** How many changes of each kind a (sub)tree holds. A whole added or removed item counts once. */
export const countFamilyChanges = (nodes: FamilyChangeNode[]): FamilyChangeCounts => {
  const counts: FamilyChangeCounts = { added: 0, removed: 0, economic: 0, description: 0 }
  const walk = (node: FamilyChangeNode) => {
    if (node.type === 'field' || node.type === 'link') {
      counts[node.kind] += 1
    } else if (node.type === 'item' && node.kind) {
      counts[node.kind] += 1
    } else {
      node.children.forEach(walk)
    }
  }
  nodes.forEach(walk)
  return counts
}

/** One version in a family's graph, as the version graph shows it. */
export interface FamilyVersionSummary {
  id: string
  name: string
  version: number
  /** The family this one was copied from with "Duplicate"; null for an import or a new version. */
  duplicatedFromId: string | null
  isPublished: boolean
  readyForInvoicing: boolean
  priceValidFrom: string | null
  priceValidTo: string | null
  createdAt: string
}

/**
 * `GET /api/product-families/:id/versions`: the family's version graph, like a git graph —
 * its own chain of versions, the copies made from any of them (each a branch with its own
 * versions), and the family its first version was copied from. Only what the caller can see.
 */
export interface FamilyVersionsResponse {
  /** The chain `:id` belongs to, oldest first. */
  versions: FamilyVersionSummary[]
  /** Copies made from a version of the chain ("Duplicate"), oldest first, each with its own versions. */
  branches: { forkFromId: string; versions: FamilyVersionSummary[] }[]
  /** The family the chain's first version was copied from, if any. */
  origin: FamilyVersionSummary | null
  /** Every edge of the graph: each version → the next one, and original → copy. */
  edges: { fromId: string; toId: string }[]
  /** The change counts along every edge of the graph (version → next version, original → copy); empty unless asked for with `?steps=true`. */
  steps: { fromId: string; toId: string; counts: FamilyChangeCounts }[]
}

/** `GET /api/product-families/:id/compare/:otherId`: always older → newer (by creation), whichever id is which. */
export interface FamilyVersionComparison {
  from: { id: string; name: string; version: number }
  to: { id: string; name: string; version: number }
  changes: FamilyChangeNode[]
  counts: FamilyChangeCounts
}
