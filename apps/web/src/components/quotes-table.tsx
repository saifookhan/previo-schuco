'use client'

import { quoteVariantCode, type QuoteSummary, type QuoteVariantRef } from '@schuco/contracts'
import { ChevronRight, ExternalLink, Star } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Fragment, useState, type MouseEvent } from 'react'

import { QuoteVariantMatrix } from '@/components/quote-editor/quote-variant-matrix'
import { QuickLookButton, QuoteQuickLook } from '@/components/quick-look-dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { Link, useRouter } from '@/i18n/navigation'
import { EUR } from '@/lib/format'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'

const statusVariant = (status: QuoteSummary['status']): 'success' | 'muted' | 'warning' => {
  if (status === 'accepted') return 'success'
  if (status === 'invoiced') return 'warning'
  return 'muted'
}

const hrefFor = (quoteId: string, variant?: { version: number; alternative: number }) =>
  variant ? `/app/quotes/${quoteId}?version=${variant.version}&alternative=${variant.alternative}` : `/app/quotes/${quoteId}`

/**
 * Quotes list. One row per quote, with the latest version's codes as tags.
 * The row opens like a product family: chevron, new tab, quick look, then the variants.
 */
export const QuotesTable = ({ quotes }: { quotes: QuoteSummary[] }) => {
  const t = useTranslations('quotes')
  const ts = useTranslations('quotes.statusValue')
  const router = useRouter()
  const { can, hasRole } = useAuth()
  const canEdit = can('quote.edit')
  const canArchive = hasRole('company-admin', 'super-admin')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<QuoteSummary | null>(null)
  const [duplicate, setDuplicate] = useState<{ quote: QuoteSummary; variant: QuoteVariantRef } | null>(null)
  const [duplicateReference, setDuplicateReference] = useState('')
  const [duplicateError, setDuplicateError] = useState<string | null>(null)

  const toggle = (id: string) => setExpandedId((current) => (current === id ? null : id))
  const onRowClick = (id: string, event: MouseEvent<HTMLTableRowElement>) => {
    const target = event.target
    if (!(target instanceof Element) || target.closest('a, button, input, select, textarea, label')) return
    toggle(id)
  }

  const toggleFavorite = async (quoteId: string, variant: QuoteVariantRef) => {
    setBusyId(variant.id)
    try {
      const response = await fetch(`/api/sales-quotes/${quoteId}/versions/${variant.id}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !variant.isFavorite }),
      })
      if (!response.ok) {
        showToast(t('favoriteFailed'), 'error')
        return
      }
      router.refresh()
    } catch {
      showToast(t('favoriteFailed'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const promote = async (quoteId: string, variant: QuoteVariantRef) => {
    setBusyId(variant.id)
    try {
      const response = await fetch(`/api/sales-quotes/${quoteId}/versions/${variant.id}/promote`, { method: 'POST' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        showToast(body?.error ?? t('promoteFailed'), 'error')
        return
      }
      router.refresh()
    } catch {
      showToast(t('promoteFailed'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const archive = async () => {
    if (!archiveTarget) return
    const archived = !archiveTarget.archivedAt
    setBusyId(archiveTarget.id)
    try {
      const response = await fetch(`/api/sales-quotes/${archiveTarget.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      })
      if (!response.ok) {
        showToast(t('archiveFailed'), 'error')
        return
      }
      setArchiveTarget(null)
      router.refresh()
    } catch {
      showToast(t('archiveFailed'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const createDuplicate = async () => {
    if (!duplicate) return
    const reference = duplicateReference.trim()
    if (!reference) {
      setDuplicateError(t('duplicateRequired'))
      return
    }
    setBusyId(duplicate.variant.id)
    setDuplicateError(null)
    try {
      const response = await fetch(`/api/sales-quotes/${duplicate.quote.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: duplicate.variant.id, reference }),
      })
      const body = (await response.json().catch(() => null)) as { quote?: { id: string }; error?: string } | null
      if (!response.ok || !body?.quote) {
        setDuplicateError(body?.error ?? t('duplicateFailed'))
        return
      }
      setDuplicate(null)
      router.push(`/app/quotes/${body.quote.id}`)
    } catch {
      setDuplicateError(t('duplicateFailed'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-500">
            <th className="w-24 px-4 py-3" />
            <th className="px-4 py-3 font-medium">{t('reference')}</th>
            <th className="px-4 py-3 font-medium">{t('customer')}</th>
            <th className="px-4 py-3 font-medium">{t('project')}</th>
            <th className="px-4 py-3 font-medium">{t('status')}</th>
            <th className="px-4 py-3 font-medium">{t('total')}</th>
            <th className="px-4 py-3 font-medium">{t('created')}</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((quote) => {
            const open = expandedId === quote.id
            const latest = quote.variants.filter((variant) => variant.version === quote.latestVersion)
            const tags = latest.length > 0 ? latest : quote.variants.slice(-1)
            return (
              <Fragment key={quote.id}>
                <tr
                  className={cn('cursor-pointer border-b border-slate-50 hover:bg-slate-50/80', open && 'border-b-0 bg-slate-50/80')}
                  onClick={(event) => onRowClick(quote.id, event)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-label={t(open ? 'collapse' : 'expand', { name: quote.reference })}
                        className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
                        onClick={(event) => {
                          event.stopPropagation()
                          toggle(quote.id)
                        }}
                      >
                        <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
                      </button>
                      <Link
                        href={hrefFor(quote.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('openInNewTab', { name: quote.reference })}
                        title={t('openInNewTab', { name: quote.reference })}
                        className="rounded p-1 text-slate-400 hover:bg-white hover:text-brand"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                      <QuickLookButton label={t('quickLook')}>
                        {(close) => <QuoteQuickLook quoteId={quote.id} onClose={close} />}
                      </QuickLookButton>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={hrefFor(quote.id)} className="hover:text-brand">{quote.reference}</Link>
                      {tags.map((variant) => {
                        const code = quoteVariantCode(variant.version, variant.alternative)
                        return (
                          <Badge key={variant.id} variant="muted" title={variant.label ?? undefined} className="gap-1">
                            {variant.isFinal ? <Star className="h-3 w-3 fill-amber-400 text-amber-500" /> : null}
                            {canEdit || variant.isFavorite ? (
                              <button
                                type="button"
                                aria-pressed={variant.isFavorite}
                                aria-label={t(variant.isFavorite ? 'unfavorite' : 'favorite', { code })}
                                disabled={!canEdit || busyId !== null}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void toggleFavorite(quote.id, variant)
                                }}
                                className="rounded p-0.5 hover:bg-white disabled:cursor-default"
                              >
                                <Star className={cn('h-3 w-3', variant.isFavorite ? 'fill-sky-500 text-sky-500' : 'text-slate-300')} />
                              </button>
                            ) : null}
                            {code}
                          </Badge>
                        )
                      })}
                      {quote.archivedAt ? <Badge variant="warning">{t('archivedBadge')}</Badge> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{quote.customerName}</td>
                  <td className="px-4 py-3 text-slate-500">{quote.projectLocation ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(quote.status)}>{ts(quote.status)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{EUR.format(Number(quote.totalPrice))}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(quote.createdAt).toLocaleDateString('it-IT')}</td>
                </tr>
                {open ? (
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <td colSpan={7} className="px-6 py-4">
                      <QuoteVariantMatrix
                        variants={quote.variants}
                        canEdit={canEdit}
                        busyId={busyId}
                        onOpen={(variant) => router.push(hrefFor(quote.id, variant))}
                        onPromote={(variant) => void promote(quote.id, variant)}
                        onToggleFavorite={(variant) => void toggleFavorite(quote.id, variant)}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        {quote.variants.map((variant) => (
                          <Button
                            key={variant.id}
                            type="button"
                            variant="outline"
                            className="h-8 text-xs"
                            disabled={!canEdit}
                            onClick={() => {
                              setDuplicate({ quote, variant })
                              setDuplicateReference(`${quote.reference} copy`)
                              setDuplicateError(null)
                            }}
                          >
                            {t('duplicate')} {quoteVariantCode(variant.version, variant.alternative)}
                          </Button>
                        ))}
                        {canArchive ? (
                          <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => setArchiveTarget(quote)}>
                            {quote.archivedAt ? t('restore') : t('archive')}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>

      <ConfirmDialog
        open={archiveTarget !== null}
        title={archiveTarget?.archivedAt ? t('restoreConfirmTitle') : t('archiveConfirmTitle')}
        description={archiveTarget?.archivedAt ? t('restoreConfirmDescription', { name: archiveTarget.reference }) : t('archiveConfirmDescription', { name: archiveTarget?.reference ?? '' })}
        confirmLabel={archiveTarget?.archivedAt ? t('restore') : t('archive')}
        cancelLabel={t('cancel')}
        busy={busyId !== null}
        onConfirm={() => void archive()}
        onCancel={() => setArchiveTarget(null)}
      />

      {duplicate ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-6" onClick={() => busyId === null && setDuplicate(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-sm font-semibold text-slate-900">{t('duplicateTitle', { code: quoteVariantCode(duplicate.variant.version, duplicate.variant.alternative) })}</p>
            <p className="mt-1 text-sm text-slate-500">{t('duplicateHint')}</p>
            <div className="mt-3 space-y-1">
              <Label htmlFor="quote-duplicate-reference">{t('fieldReference')}</Label>
              <Input id="quote-duplicate-reference" value={duplicateReference} onChange={(event) => setDuplicateReference(event.target.value)} />
            </div>
            {duplicateError ? <p className="mt-2 text-xs text-red-600">{duplicateError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busyId !== null} onClick={() => setDuplicate(null)}>{t('cancel')}</Button>
              <Button type="button" disabled={busyId !== null} onClick={() => void createDuplicate()}>{t('duplicate')}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
