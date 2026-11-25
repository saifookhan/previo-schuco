'use client'

import {
  familyTotal,
  familyTotalM2,
  hasVisibleText,
  lineNetUnitPrice,
  lineTotal,
  lineTotalM2,
  quoteDocumentSchema,
  quoteTotal,
  totalsByCategory,
  type BusinessUnit,
  type CompanyProfile,
  type QuoteDocument,
  type QuoteLine,
  type QuotePrintData,
  type QuotePrintSettings,
  type SalesContact,
} from '@schuco/contracts'
import { Printer, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { previewStorageKey } from '@/components/quote-editor/preview-storage'
import { DECIMAL, EUR } from '@/lib/format'

// ── A4 dimensions (as the client's preview) ──────────────────────────────────
const MM2PX = 96 / 25.4
const CONTENT_W_PX = (210 - 40) * MM2PX
const HEADER_H_PX = 95
const FOOTER_H_PX = 42
const CONTENT_H_PX = (297 - 40) * MM2PX - HEADER_H_PX - FOOTER_H_PX
const DEFAULT_ACCENT = '#1E5F8C'

interface ContentItem {
  key: string
  element: ReactNode
  /** Keep this item on the same page as the next one (a family's header with its first line). */
  keepWithNext?: boolean
}

type T = ReturnType<typeof useTranslations<'quotePrint'>>

const formatDate = (iso: string): string => {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

const PageHeader = ({
  unit,
  contact,
  settings,
  reference,
  document,
  t,
}: {
  unit: BusinessUnit | null
  contact: SalesContact | null
  settings: QuotePrintSettings
  reference: string
  document: QuoteDocument
  t: T
}) => {
  const accent = unit?.primaryColor ?? DEFAULT_ACCENT
  return (
    <div style={{ borderBottom: `2px solid ${accent}`, marginBottom: '10px', paddingBottom: '8px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {unit?.logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL from the company profile
          <img src={unit.logoDataUrl} alt={unit.name} style={{ height: '36px', objectFit: 'contain', flexShrink: 0 }} />
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: accent, fontWeight: 700, fontSize: '13px', lineHeight: 1.2 }}>{unit?.name ?? '—'}</div>
          {unit?.address ? <div style={{ fontSize: '9px', color: '#64748b', lineHeight: 1.4 }}>{unit.address}</div> : null}
          {unit?.email || unit?.phone ? (
            <div style={{ fontSize: '9px', color: '#64748b' }}>{[unit.email, unit.phone].filter(Boolean).join(' · ')}</div>
          ) : null}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b' }}>{reference}</div>
          <div style={{ fontSize: '9px', color: '#94a3b8' }}>{formatDate(document.header.quoteDate)}</div>
          <div style={{ fontSize: '10px', color: '#475569', fontWeight: 600 }}>{document.header.customerName}</div>
        </div>
      </div>
      {settings.showSalesContact && contact ? (
        <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '5px' }}>
          {t('yourContact')}: <span style={{ color: '#475569', fontWeight: 600 }}>{contact.name ?? contact.email}</span>
          {' — '}
          {contact.email}
          {contact.phone ? ` — ${contact.phone}` : ''}
        </div>
      ) : null}
    </div>
  )
}

const PageFooter = ({ company, page, pages, t }: { company: CompanyProfile; page: number; pages: number; t: T }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTop: '1px solid #e2e8f0',
      paddingTop: '6px',
      marginTop: '6px',
      flexShrink: 0,
      fontSize: '7.5px',
      color: '#94a3b8',
      lineHeight: 1.4,
    }}
  >
    <div>
      {[
        company.name,
        company.fiscalAddress,
        company.vatNumber ? `${t('vatNumber')} ${company.vatNumber}` : null,
        company.fiscalCode ? `${t('fiscalCode')} ${company.fiscalCode}` : null,
        company.sdiCode ? `${t('sdiCode')} ${company.sdiCode}` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    </div>
    <div style={{ flexShrink: 0, marginLeft: '12px', fontWeight: 600, color: '#64748b' }}>{t('pageOf', { page, pages })}</div>
  </div>
)

const ColHeader = ({ settings, t }: { settings: QuotePrintSettings; t: T }) => (
  <div
    style={{
      display: 'flex',
      fontSize: '7.5px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: '#94a3b8',
      borderBottom: '1.5px solid #94a3b8',
      paddingBottom: '2px',
    }}
  >
    <div style={{ width: '22px', flexShrink: 0 }}>#</div>
    <div style={{ flex: 1, minWidth: 0 }}>{t('colDescription')}</div>
    <div style={{ width: '54px', flexShrink: 0, textAlign: 'center' }}>{t('colSize')}</div>
    <div style={{ width: '24px', flexShrink: 0, textAlign: 'center' }}>{t('colQty')}</div>
    <div style={{ width: '24px', flexShrink: 0, textAlign: 'center' }}>{t('colUnit')}</div>
    <div style={{ width: '42px', flexShrink: 0, textAlign: 'right', textTransform: 'none' }}>m²</div>
    {settings.showExtraMarkup ? <div style={{ width: '32px', flexShrink: 0, textAlign: 'right' }}>{t('colExtra')}</div> : null}
    {settings.showDiscount ? <div style={{ width: '28px', flexShrink: 0, textAlign: 'right' }}>{t('colDiscount')}</div> : null}
    {settings.showDiscount ? <div style={{ width: '62px', flexShrink: 0, textAlign: 'right' }}>{t('colUnitPrice')}</div> : null}
    <div style={{ width: '62px', flexShrink: 0, textAlign: 'right' }}>{t('colNet')}</div>
    <div style={{ width: '68px', flexShrink: 0, textAlign: 'right' }}>{t('colTotal')}</div>
  </div>
)

const tabular = { fontVariantNumeric: 'tabular-nums' } as const

const LineRow = ({ line, index, settings, t }: { line: QuoteLine; index: number; settings: QuotePrintSettings; t: T }) => {
  const m2 = lineTotalM2(line)
  const characteristics = settings.showLineCharacteristics ? line.options.map((option) => `${option.name}: ${option.value}`).join(' · ') : ''
  return (
    <>
      <div
        style={{
          display: 'flex',
          fontSize: '9.5px',
          borderBottom: line.isAlternative ? 'none' : '1px solid #f1f5f9',
          borderLeft: line.isAlternative ? '3px solid #d97706' : '3px solid transparent',
          padding: '2px 0 2px 4px',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ width: '22px', flexShrink: 0, color: '#94a3b8', ...tabular }}>{line.code || index + 1}</div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: '4px', color: '#334155', lineHeight: 1.3 }}>
          {line.name}
          {characteristics ? <div style={{ fontSize: '8px', color: '#94a3b8', lineHeight: 1.3 }}>{characteristics}</div> : null}
        </div>
        <div style={{ width: '54px', flexShrink: 0, textAlign: 'center', color: '#64748b', ...tabular }}>
          {line.widthMm && line.heightMm ? `${line.widthMm}×${line.heightMm}` : '—'}
        </div>
        <div style={{ width: '24px', flexShrink: 0, textAlign: 'center', color: '#334155', ...tabular }}>{line.quantity}</div>
        <div style={{ width: '24px', flexShrink: 0, textAlign: 'center', color: '#94a3b8', fontSize: '8px' }}>{line.unit}</div>
        <div style={{ width: '42px', flexShrink: 0, textAlign: 'right', color: '#64748b', ...tabular }}>{m2 != null ? DECIMAL.format(m2) : '—'}</div>
        {settings.showExtraMarkup ? (
          <div style={{ width: '32px', flexShrink: 0, textAlign: 'right', color: '#64748b', ...tabular }}>{line.extraMarkupPct}%</div>
        ) : null}
        {settings.showDiscount ? (
          <div style={{ width: '28px', flexShrink: 0, textAlign: 'right', color: '#64748b', ...tabular }}>{line.discountPct}%</div>
        ) : null}
        {settings.showDiscount ? (
          <div style={{ width: '62px', flexShrink: 0, textAlign: 'right', color: '#64748b', fontSize: '8.5px', ...tabular }}>{EUR.format(line.unitPrice)}</div>
        ) : null}
        <div style={{ width: '62px', flexShrink: 0, textAlign: 'right', color: '#475569', fontSize: '8.5px', ...tabular }}>{EUR.format(lineNetUnitPrice(line))}</div>
        <div style={{ width: '68px', flexShrink: 0, textAlign: 'right', fontWeight: 600, color: line.isAlternative ? '#d97706' : '#1e293b', ...tabular }}>
          {EUR.format(lineTotal(line))}
        </div>
      </div>
      {line.isAlternative ? (
        <div
          style={{
            fontSize: '8px',
            color: '#d97706',
            fontStyle: 'italic',
            padding: '1px 0 3px 26px',
            borderBottom: '1px solid #f1f5f9',
            borderLeft: '3px solid #d97706',
          }}
        >
          {t('lineAlternative')}
        </div>
      ) : null}
    </>
  )
}

const sectionTitle = (size: string, spacing: string, margin: string) =>
  ({ fontSize: size, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: spacing, marginBottom: margin }) as const

const summaryRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #f1f5f9', fontSize: '10px' } as const
const mono = { fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace', color: '#1e293b' } as const

/** The printed quote as a flat list of blocks, to be laid out on A4 pages. */
const buildContentItems = (document: QuoteDocument, reference: string, t: T): ContentItem[] => {
  const settings = document.printSettings
  const items: ContentItem[] = []
  const total = quoteTotal(document)

  items.push({
    key: 'doc-meta',
    element: (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 16px',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '10px',
          marginBottom: '10px',
        }}
      >
        {[
          [t('customer'), document.header.customerName],
          [t('reference'), reference],
          [t('project'), document.header.projectLocation ?? ''],
          [t('date'), formatDate(document.header.quoteDate)],
        ].map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: '7.5px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#1e293b' }}>{value}</div>
          </div>
        ))}
      </div>
    ),
  })

  const intro = document.intro.filter((module) => hasVisibleText(module.html))
  if (intro.length > 0) {
    items.push({
      key: 'intro-text',
      element: (
        <div style={{ marginBottom: '12px' }}>
          <div style={sectionTitle('7.5px', '0.06em', '4px')}>{t('intro')}</div>
          {intro.map((module) => (
            <div
              key={module.id}
              className="quote-rich quote-print-rich"
              style={{ fontSize: '9.5px', color: '#475569', lineHeight: 1.55 }}
              // Sanitized by the API on save (and the unsaved preview comes from the user's own editor).
              dangerouslySetInnerHTML={{ __html: module.html }}
            />
          ))}
        </div>
      ),
    })
  }

  for (const family of document.families) {
    items.push({
      key: `fam-${family.id}-start`,
      keepWithNext: family.lines.length > 0,
      element: (
        <div style={{ marginTop: '14px', marginBottom: '1px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b' }}>{family.name}</span>
            {family.category ? (
              <span style={{ fontSize: '8px', background: '#f1f5f9', color: '#64748b', padding: '1px 5px', borderRadius: '3px' }}>{family.category}</span>
            ) : null}
            {family.isAlternative ? <span style={{ fontSize: '8px', color: '#d97706', fontStyle: 'italic' }}>{t('familyAlternative')}</span> : null}
          </div>
          {settings.showFamilyDescription && family.description ? (
            <p style={{ fontSize: '8.5px', color: '#64748b', marginBottom: '4px', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{family.description}</p>
          ) : null}
          <ColHeader settings={settings} t={t} />
        </div>
      ),
    })
    family.lines.forEach((line, index) => {
      items.push({ key: `fam-${family.id}-line-${line.id}`, element: <LineRow line={line} index={index} settings={settings} t={t} /> })
    })
    const m2 = familyTotalM2(family)
    items.push({
      key: `fam-${family.id}-subtotal`,
      element: (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '16px',
            borderTop: '1px solid #334155',
            paddingTop: '3px',
            marginTop: '1px',
            marginBottom: '6px',
          }}
        >
          {m2 > 0 ? (
            <span style={{ fontSize: '8.5px', color: '#64748b' }}>
              {t('totalSurface')}: <span style={{ fontWeight: 600, color: '#334155', ...tabular }}>{DECIMAL.format(m2)} m²</span>
            </span>
          ) : null}
          <span style={{ fontSize: '8.5px', color: '#64748b' }}>{t('subtotal', { name: family.name })}</span>
          <span style={{ fontSize: '10px', fontWeight: 700, ...mono }}>{EUR.format(familyTotal(family))}</span>
        </div>
      ),
    })
  }

  for (const block of document.closing) {
    const key = `closing-${block.id}`
    if (block.type === 'text') {
      if (!hasVisibleText(block.html)) continue
      items.push({
        key,
        element: (
          <div
            className="quote-rich quote-print-rich"
            style={{ fontSize: '9px', color: '#475569', lineHeight: 1.5, marginTop: '10px' }}
            dangerouslySetInnerHTML={{ __html: block.html }}
          />
        ),
      })
    } else if (block.type === 'familySummary' && settings.showFamilySummary) {
      items.push({
        key,
        element: (
          <div style={{ marginTop: '14px' }}>
            <div style={sectionTitle('7.5px', '0.06em', '4px')}>{t('familySummary')}</div>
            {document.families.map((family) => (
              <div key={family.id} style={summaryRow}>
                <span style={{ color: '#334155', flex: 1 }}>
                  {family.name}
                  {family.isAlternative ? (
                    <span style={{ display: 'block', fontSize: '8px', color: '#d97706', fontStyle: 'italic', marginTop: '1px' }}>{t('familyAlternative')}</span>
                  ) : null}
                </span>
                <span style={{ ...mono, flexShrink: 0, paddingLeft: '8px' }}>{EUR.format(familyTotal(family))}</span>
              </div>
            ))}
          </div>
        ),
      })
    } else if (block.type === 'categorySummary' && settings.showCategorySummary) {
      items.push({
        key,
        element: (
          <div style={{ marginTop: '10px' }}>
            <div style={sectionTitle('7.5px', '0.06em', '4px')}>{t('categorySummary')}</div>
            {totalsByCategory(document.families, block.categoryOrder).map((row) => (
              <div key={row.category} style={summaryRow}>
                <span style={{ color: '#334155' }}>{row.category}</span>
                <span style={mono}>{EUR.format(row.total)}</span>
              </div>
            ))}
          </div>
        ),
      })
    } else if (block.type === 'total' && settings.showTotal) {
      items.push({
        key,
        element: (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '14px',
              paddingTop: '10px',
              borderTop: '2px solid #1e293b',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{t('totalVatExcluded')}</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: DEFAULT_ACCENT, fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
              {EUR.format(total)}
            </span>
          </div>
        ),
      })
    } else if (block.type === 'payments' && settings.showPayments && block.rows.length > 0) {
      items.push({
        key,
        element: (
          <div style={{ marginTop: '12px' }}>
            <div style={sectionTitle('9px', '0.08em', '4px')}>{t('payments')}</div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex',
                  fontSize: '8px',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  background: '#f8fafc',
                  padding: '3px 8px',
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                <span style={{ flex: 1 }}>{t('colDescription')}</span>
                <span style={{ width: '32px', textAlign: 'right' }}>%</span>
                <span style={{ width: '72px', textAlign: 'right' }}>{t('amount')}</span>
              </div>
              {block.rows.map((row, index) => (
                <div
                  key={row.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '9.5px',
                    padding: '3px 8px',
                    borderBottom: index < block.rows.length - 1 ? '1px solid #f1f5f9' : 'none',
                    background: '#fff',
                  }}
                >
                  <span style={{ flex: 1, color: '#334155' }}>{row.description}</span>
                  <span style={{ width: '32px', textAlign: 'right', color: '#64748b', ...tabular }}>{row.pct}%</span>
                  <span style={{ width: '72px', textAlign: 'right', fontWeight: 600, fontSize: '9px', ...mono }}>
                    {EUR.format(total > 0 ? total * (row.pct / 100) : 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ),
      })
    } else if (block.type === 'activities' && settings.showActivities) {
      const included = block.rows.filter((row) => row.included && row.enabled)
      const excluded = block.rows.filter((row) => !row.included && row.enabled)
      if (included.length === 0 && excluded.length === 0) continue
      const zoneTitle = (color: string) =>
        ({ fontSize: '8px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '3px' }) as const
      items.push({
        key,
        element: (
          <div style={{ marginTop: '12px' }}>
            <div style={sectionTitle('9px', '0.08em', '6px')}>{t('activities')}</div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {included.length > 0 ? (
                <div style={{ flex: 1 }}>
                  <div style={zoneTitle('#059669')}>
                    <span>✓</span> {t('included')}
                  </div>
                  {included.map((row) => (
                    <div
                      key={row.id}
                      style={{ fontSize: '9.5px', color: '#334155', padding: '1.5px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span style={{ color: '#10b981', fontSize: '8px' }}>•</span>
                      {row.description}
                    </div>
                  ))}
                </div>
              ) : null}
              {excluded.length > 0 ? (
                <div style={{ flex: 1 }}>
                  <div style={zoneTitle('#b45309')}>
                    <span>✗</span> {t('notIncluded')}
                  </div>
                  {excluded.map((row) => (
                    <div
                      key={row.id}
                      style={{ fontSize: '9.5px', color: '#78350f', padding: '1.5px 0', borderBottom: '1px solid #fef3c7', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span style={{ color: '#d97706', fontSize: '8px' }}>•</span>
                      {row.description}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ),
      })
    }
  }

  return items
}

/** Fills pages top-down; an item that doesn't fit starts a new page, and a family header takes its first line along. */
const groupIntoPages = (items: ContentItem[], heights: Map<string, number>): ContentItem[][] => {
  const pages: ContentItem[][] = [[]]
  let current = 0
  items.forEach((item, index) => {
    const height = heights.get(item.key) ?? 20
    const needed = item.keepWithNext && index + 1 < items.length ? height + (heights.get(items[index + 1].key) ?? 20) : height
    if (pages[pages.length - 1].length > 0 && current + needed > CONTENT_H_PX) {
      pages.push([])
      current = 0
    }
    pages[pages.length - 1].push(item)
    current += height
  })
  return pages.filter((page) => page.length > 0)
}

const Paginated = ({
  document,
  reference,
  company,
  unit,
  contact,
}: {
  document: QuoteDocument
  reference: string
  company: CompanyProfile
  unit: BusinessUnit | null
  contact: SalesContact | null
}) => {
  const t = useTranslations('quotePrint')
  const items = useMemo(() => buildContentItems(document, reference, t), [document, reference, t])
  const [pages, setPages] = useState<ContentItem[][] | null>(null)
  const measureRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const container = measureRef.current
    if (!container) return
    const measure = () => {
      const heights = new Map<string, number>()
      for (const element of Array.from(container.children)) {
        const key = (element as HTMLElement).dataset.key
        if (key) heights.set(key, element.getBoundingClientRect().height)
      }
      const grouped = groupIntoPages(items, heights)
      setPages(grouped.length > 0 ? grouped : [[]])
    }
    measure()
    // Logos and inline images change the heights once they load.
    const images = Array.from(container.querySelectorAll('img')).filter((image) => !image.complete)
    images.forEach((image) => image.addEventListener('load', measure, { once: true }))
    return () => images.forEach((image) => image.removeEventListener('load', measure))
  }, [items])

  const total = pages?.length ?? 1

  return (
    <div className="min-h-screen bg-slate-100">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .workarea { background: transparent !important; padding: 0 !important; gap: 0 !important; }
          .page-container { box-shadow: none !important; margin: 0 !important; page-break-after: always; break-after: page; }
          .page-container:last-child { page-break-after: auto; break-after: auto; }
        }
        .quote-print-rich p { margin-top: 0.25em; margin-bottom: 0.25em; }
        .quote-print-rich ul, .quote-print-rich ol { margin-top: 0.25em; margin-bottom: 0.25em; padding-left: 1.2em; }
        .quote-print-rich li { margin-top: 0; margin-bottom: 0; }
        .quote-print-rich h1 { font-size: 1.5em; }
        .quote-print-rich h2 { font-size: 1.25em; }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-4 px-6">
          <div className="flex min-w-0 flex-col">
            <span className="text-[14px] font-semibold leading-none text-slate-700">{t('title')}</span>
            <span className="truncate text-[12px] text-slate-400">
              {reference} — {document.header.customerName}
            </span>
          </div>
          <div className="flex-1" />
          {pages ? <span className="text-[12px] text-slate-400">{t('pages', { count: total })}</span> : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-dark"
          >
            <Printer size={15} />
            {t('print')}
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-600 transition-colors hover:bg-slate-50"
          >
            <X size={15} />
            {t('close')}
          </button>
        </div>
      </div>

      <div
        ref={measureRef}
        aria-hidden
        style={{ position: 'fixed', left: '-9999px', top: 0, width: `${CONTENT_W_PX}px`, visibility: 'hidden', pointerEvents: 'none' }}
      >
        {items.map((item) => (
          <div key={item.key} data-key={item.key}>
            {item.element}
          </div>
        ))}
      </div>

      {pages ? (
        <div className="workarea flex flex-col items-center gap-10 px-4 py-10">
          {pages.map((group, index) => (
            <div
              key={index}
              className="page-container bg-white"
              style={{
                width: '210mm',
                height: '297mm',
                display: 'flex',
                flexDirection: 'column',
                padding: '20mm',
                boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
                overflow: 'hidden',
              }}
            >
              <PageHeader unit={unit} contact={contact} settings={document.printSettings} reference={reference} document={document} t={t} />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {group.map((item) => (
                  <Fragment key={item.key}>{item.element}</Fragment>
                ))}
              </div>
              <PageFooter company={company} page={index + 1} pages={total} t={t} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center">
          <span className="text-[13px] text-slate-400">{t('preparing')}</span>
        </div>
      )}
    </div>
  )
}

/**
 * "Anteprima Preventivo": the quote laid out on A4 pages, printed (or saved as PDF) by the
 * browser. With `unsaved`, it shows the editor's unsaved document handed over in sessionStorage.
 */
export const QuotePrintView = ({
  data,
  businessUnits,
  salesContacts,
  unsaved,
}: {
  data: QuotePrintData
  /** To pick the branch and contact of an unsaved document (its print settings may differ from the saved ones). */
  businessUnits: BusinessUnit[]
  salesContacts: SalesContact[]
  unsaved: boolean
}) => {
  const t = useTranslations('quotePrint')
  const [document, setDocument] = useState<QuoteDocument | null>(unsaved ? null : data.version.document)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!unsaved) return
    try {
      const raw = window.sessionStorage.getItem(previewStorageKey(data.quote.id))
      const parsed = raw ? quoteDocumentSchema.safeParse(JSON.parse(raw)) : null
      if (parsed?.success) setDocument(parsed.data)
      else setFailed(true)
    } catch {
      setFailed(true)
    }
  }, [unsaved, data.quote.id])

  // The discount column always prints while a line has a discount (memoized: pagination re-measures on every new document).
  const shown = useMemo(() => {
    if (!document) return null
    const discountRequired = document.families.some((family) => family.lines.some((line) => line.discountPct !== 0))
    return discountRequired && !document.printSettings.showDiscount ? { ...document, printSettings: { ...document.printSettings, showDiscount: true } } : document
  }, [document])

  if (failed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="max-w-md rounded-xl bg-white p-10 text-center shadow">
          <p className="mb-2 text-[15px] font-medium text-slate-700">{t('nothingToShow')}</p>
          <p className="text-[13px] text-slate-400">{t('nothingToShowHint')}</p>
        </div>
      </div>
    )
  }
  if (!shown) {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-[13px] text-slate-400">{t('preparing')}</span>
      </div>
    )
  }

  const settings = shown.printSettings
  const unit = unsaved ? (businessUnits.find((u) => u.id === settings.businessUnitId) ?? businessUnits[0] ?? null) : data.businessUnit
  const contact = unsaved ? (salesContacts.find((c) => c.id === settings.salesContactUserId) ?? null) : data.salesContact
  return <Paginated document={shown} reference={data.quote.reference} company={data.company} unit={unit} contact={contact} />
}
