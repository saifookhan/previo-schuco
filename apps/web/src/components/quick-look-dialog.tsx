'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { familyTotal, quoteTotal, quoteVariantCode, type QuoteFamily, type SalesQuoteDetailResponse } from '@schuco/contracts'
import { Eye, Loader2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'

import { EUR } from '@/lib/format'
import type { ProductFamilyDetail } from '@/types/product-family'

const errorText = async (response: Response): Promise<string> => {
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  return body?.error ?? ''
}

/** Eye button that opens a short overview. The dialog fetches when it opens. */
export const QuickLookButton = ({ label, children }: { label: string; children: (close: () => void) => ReactNode }) => {
  const [open, setOpen] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="rounded p-1 text-slate-400 hover:bg-white hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          onClick={(event) => event.stopPropagation()}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
        <Dialog.Content className="fixed left-1/2 top-[10vh] z-50 flex max-h-[80vh] w-[min(94vw,640px)] -translate-x-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          {children(() => setOpen(false))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const Shell = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => {
  const t = useTranslations('quotes')
  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <Dialog.Title className="text-sm font-semibold text-slate-800">{title}</Dialog.Title>
        <Dialog.Close className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={t('close')} onClick={onClose}>
          <X className="h-4 w-4" />
        </Dialog.Close>
      </div>
      <div className="overflow-y-auto px-5 py-4">{children}</div>
    </>
  )
}

/** Families and lines of one quote variant, with a switch for the latest version's alternatives. */
export const QuoteQuickLook = ({ quoteId, onClose }: { quoteId: string; onClose: () => void }) => {
  const t = useTranslations('quotes')
  const ts = useTranslations('quotes.statusValue')
  const [detail, setDetail] = useState<SalesQuoteDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = (version?: number, alternative?: number) => {
    const params = new URLSearchParams()
    if (version) params.set('version', String(version))
    if (alternative) params.set('alternative', String(alternative))
    const query = params.toString()
    setError(null)
    void fetch(`/api/sales-quotes/${quoteId}${query ? `?${query}` : ''}`)
      .then(async (response) => {
        if (!response.ok) {
          setError(await errorText(response) || t('quickLookFailed'))
          return
        }
        setDetail((await response.json()) as SalesQuoteDetailResponse)
      })
      .catch(() => setError(t('quickLookFailed')))
  }

  useEffect(() => {
    load()
  }, [quoteId])

  const latest = detail ? Math.max(...detail.versions.map((variant) => variant.version)) : 0
  const latestVariants = detail?.versions.filter((variant) => variant.version === latest) ?? []

  return (
    <Shell title={detail ? `${detail.quote.reference} · ${quoteVariantCode(detail.version.version, detail.version.alternative)}` : t('quickLook')} onClose={onClose}>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!detail && !error ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{t('quickLookLoading')}</p>
      ) : null}
      {detail ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="font-medium text-slate-800">{detail.version.document.header.customerName}</p>
              <p className="text-sm text-slate-500">{detail.version.document.header.projectLocation || '—'}</p>
            </div>
            <p className="font-mono text-lg font-semibold text-brand">{EUR.format(quoteTotal(detail.version.document))}</p>
          </div>
          {latestVariants.length > 1 ? (
            <div className="flex flex-wrap gap-1">
              {latestVariants.map((variant) => {
                const code = quoteVariantCode(variant.version, variant.alternative)
                const on = variant.id === detail.version.id
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => load(variant.version, variant.alternative)}
                    className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-brand bg-brand/10 text-brand' : 'border-slate-200 text-slate-600'}`}
                  >
                    {code}{variant.label ? ` · ${variant.label}` : ''} · {ts(variant.status)}
                  </button>
                )
              })}
            </div>
          ) : null}
          {detail.version.label ? <p className="text-sm text-slate-600">{detail.version.label}</p> : null}
          <ul className="space-y-3">
            {detail.version.document.families.map((family) => (
              <FamilyBlock key={family.id} family={family} />
            ))}
            {detail.version.document.families.length === 0 ? <li className="text-sm text-slate-400">{t('quickLookEmpty')}</li> : null}
          </ul>
        </div>
      ) : null}
    </Shell>
  )
}

const FamilyBlock = ({ family }: { family: QuoteFamily }) => {
  const t = useTranslations('quotes')
  return (
    <li className="rounded-lg border border-slate-100 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="font-medium text-slate-800">
          {family.name}
          {family.isAlternative ? <span className="ml-2 text-[10px] uppercase text-slate-400">{t('quickLookAlt')}</span> : null}
        </p>
        <p className="font-mono text-xs text-slate-500">{EUR.format(familyTotal(family))}</p>
      </div>
      <ul className="space-y-1">
        {family.lines.map((line) => (
          <li key={line.id} className="flex justify-between gap-3 text-xs text-slate-600">
            <span className="min-w-0 truncate">
              {line.code ? `${line.code} ` : ''}{line.name}
              {line.isAlternative ? ` (${t('quickLookAlt')})` : ''}
              <span className="text-slate-400"> · {line.quantity} {line.unit}</span>
            </span>
            <span className="shrink-0 font-mono">{EUR.format(line.unitPrice)}</span>
          </li>
        ))}
      </ul>
    </li>
  )
}

/** Name, descriptions and product lines of a family. Pricing matrices stay out. */
export const FamilyQuickLook = ({ familyId, onClose }: { familyId: string; onClose: () => void }) => {
  const t = useTranslations('productFamilies')
  const [detail, setDetail] = useState<ProductFamilyDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch(`/api/product-families/${familyId}`)
      .then(async (response) => {
        if (!response.ok) {
          setError(t('quickLookFailed'))
          return
        }
        setDetail((await response.json()) as ProductFamilyDetail)
      })
      .catch(() => setError(t('quickLookFailed')))
  }, [familyId, t])

  const family = detail?.family
  return (
    <Shell title={family ? `${family.name} · V${family.version}` : t('quickLook')} onClose={onClose}>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!detail && !error ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{t('quickLookLoading')}</p>
      ) : null}
      {family && detail ? (
        <div className="space-y-3 text-sm">
          <p className="text-slate-500">{[family.category, family.brand].filter(Boolean).join(' · ') || '—'}</p>
          {family.description1 ? <p className="text-slate-700">{family.description1}</p> : null}
          {family.description2 ? <p className="text-slate-600">{family.description2}</p> : null}
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {detail.lines.map((line) => (
              <li key={line.id} className="flex justify-between gap-3 px-3 py-2">
                <span className="text-slate-700">{line.name}</span>
                <span className="text-slate-400">{line.unitSymbol}</span>
              </li>
            ))}
            {detail.lines.length === 0 ? <li className="px-3 py-2 text-slate-400">{t('quickLookEmpty')}</li> : null}
          </ul>
        </div>
      ) : null}
    </Shell>
  )
}
