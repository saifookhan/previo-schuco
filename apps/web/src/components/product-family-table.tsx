'use client'

import { ChevronRight, ExternalLink, Star } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Fragment, useState, type MouseEvent, type ReactNode } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ProductFamilyFlagSelect } from '@/components/product-family-flag-select'
import { PriceValidityBadge, PriceValidityFields } from '@/components/product-family-price-validity'
import { ProductFamilyPublishSwitch, ProductFamilyRowActions } from '@/components/product-family-row-actions'
import { ProductFamilyShareButton } from '@/components/product-family-share-button'
import { FamilyQuickLook, QuickLookButton } from '@/components/quick-look-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { Link, useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { ProductFamilySummary } from '@/types/product-family'
import type { PriceValidity } from '@schuco/contracts'

/** `YYYY-MM-DD` as `DD.MM.YYYY`, the shape the list shows instead of a sentence. */
const formatDay = (value: string) => {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}.${month}.${year}` : value
}

/** The two dates as `01.01.2026 – 31.12.2026`, with Upcoming / Expired when the prices aren't current. */
const ValidityCell = ({ validity, today }: { validity: PriceValidity; today: string }) => {
  const from = validity.priceValidFrom ? formatDay(validity.priceValidFrom) : null
  const to = validity.priceValidTo ? formatDay(validity.priceValidTo) : null
  const text = from && to ? `${from} – ${to}` : (from ?? to)
  return (
    <div className="space-y-1">
      <p className="whitespace-nowrap text-slate-600">{text ?? '—'}</p>
      <PriceValidityBadge validity={validity} today={today} />
    </div>
  )
}

/** A label and its switch, as two cells of the left column's grid so the switches line up. */
const Setting = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <span className="text-sm text-slate-600">{label}</span>
    {children}
  </>
)

/** One color per flag, so the stacked tags stay distinguishable. */
const TAGS = [
  { key: 'hasPriceList', label: 'hasPriceList', className: 'bg-sky-100 text-sky-800', on: (family: ProductFamilySummary) => family.hasPriceList },
  { key: 'readyForInvoicing', label: 'readyForInvoicing', className: 'bg-violet-100 text-violet-800', on: (family: ProductFamilySummary) => family.readyForInvoicing },
  { key: 'inLibrary', label: 'inLibrary', className: 'bg-teal-100 text-teal-800', on: (family: ProductFamilySummary) => family.inLibrary ?? true },
] as const

/** The flags that are on, stacked. The switches that change them sit in the expanded row. */
const TagsCell = ({ family }: { family: ProductFamilySummary }) => {
  const t = useTranslations('productFamilies')
  const tags = TAGS.filter((tag) => tag.on(family))
  if (tags.length === 0) return <span className="text-slate-400">—</span>
  return (
    <div className="flex flex-col items-start gap-1">
      {tags.map((tag) => (
        <Badge key={tag.key} className={cn('whitespace-nowrap', tag.className)}>
          {t(tag.label)}
        </Badge>
      ))}
    </div>
  )
}

/** Technical name, versions, the settings, the two dates, and delete — one open row at a time. */
const ExpandedFamily = ({ family, tab }: { family: ProductFamilySummary; tab: 'own' | 'shared' }) => {
  const t = useTranslations('productFamilies')
  const tFlags = useTranslations('productFamilyFlags')
  const tVersion = useTranslations('productFamilyVersion')
  return (
    <div className="space-y-4">
      {family.technicalName ? <p className="text-sm text-slate-500">{family.technicalName}</p> : null}
      <div className="flex items-start gap-16">
        <div className="min-w-0 space-y-4">
          <div className="grid w-fit grid-cols-[max-content_auto] items-center justify-items-start gap-x-3 gap-y-2">
            <Setting label={t('publishedStatus')}>
              <ProductFamilyPublishSwitch
                familyId={family.id}
                familyName={family.name}
                isPublished={family.isPublished}
                canEdit={tab === 'own'}
              />
            </Setting>
            <Setting label={tFlags('hasPriceList.title')}>
              <ProductFamilyFlagSelect
                flag="hasPriceList"
                appearance="switch"
                familyId={family.id}
                familyName={family.name}
                value={family.hasPriceList}
                canEdit={tab === 'own'}
              />
            </Setting>
            <Setting label={tFlags('readyForInvoicing.title')}>
              <ProductFamilyFlagSelect
                flag="readyForInvoicing"
                appearance="switch"
                familyId={family.id}
                familyName={family.name}
                value={family.readyForInvoicing}
                canEdit={tab === 'own'}
              />
            </Setting>
            {/* The caller's company library: changed on both tabs, own families and shared ones. */}
            <Setting label={tFlags('inLibrary.title')}>
              <ProductFamilyFlagSelect
                flag="inLibrary"
                appearance="switch"
                familyId={family.id}
                familyName={family.name}
                value={family.inLibrary ?? true}
                canEdit
              />
            </Setting>
          </div>
          <PriceValidityFields
            familyId={family.id}
            familyName={family.name}
            validity={{ priceValidFrom: family.priceValidFrom, priceValidTo: family.priceValidTo }}
            canEdit={tab === 'own'}
          />
          {tab === 'own' ? (
            <div className="flex flex-wrap items-center justify-start gap-2">
              <ProductFamilyRowActions
                familyId={family.id}
                familyName={family.name}
                isPublished={family.isPublished}
                readyForInvoicing={family.readyForInvoicing}
                validity={family}
                showPublish={false}
                showDuplicate={false}
                labeledDelete
              />
              <ArchiveFamilyButton family={family} />
            </div>
          ) : null}
        </div>
        <div className="shrink-0 space-y-1 text-left">
          <p className="text-sm font-medium text-slate-700">{t('versions')}</p>
          <p className="text-sm text-slate-600">{tVersion('current', { version: family.version })}</p>
          {family.supersedesId ? (
            <Link
              href={`/app/product-families/${family.supersedesId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {tVersion('viewPreviousVersion')}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * Product families list. Click a row to open it (one at a time); the name, the new-tab icon,
 * share and duplicate keep their own actions. The open row stays open across a save,
 * because this state lives here and a refresh only replaces the family data.
 */
export const ProductFamilyTable = ({
  families,
  tab,
  today,
}: {
  families: ProductFamilySummary[]
  tab: 'own' | 'shared'
  /** `priceValidityToday()` from the server page, so the badge matches the server render. */
  today: string
}) => {
  const t = useTranslations('productFamilies')
  const tVersion = useTranslations('productFamilyVersion')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const shared = tab === 'shared'
  const columnCount = shared ? 10 : 8

  const toggle = (id: string) => setExpandedId((current) => (current === id ? null : id))

  // Links and controls inside the row do their own job. Anything else opens or closes the row.
  const onRowClick = (id: string, event: MouseEvent<HTMLTableRowElement>) => {
    const target = event.target
    if (!(target instanceof Element) || target.closest('a, button, input, select, textarea, label')) return
    toggle(id)
  }

  return (
    <table className="w-max text-sm [&_td]:whitespace-nowrap [&_td]:px-4 [&_td]:py-3 [&_th]:whitespace-nowrap [&_th]:px-4 [&_th]:py-3 [&_td]:align-middle [&_th]:align-middle [&_td:first-child]:pl-6 [&_th:first-child]:pl-6">
      <thead>
        <tr className="border-b border-slate-100 text-left text-slate-500">
          <th className="w-16" />
          <th className="font-medium">{t('name')}</th>
          {shared ? <th className="font-medium">{t('owner')}</th> : null}
          <th className="font-medium">{t('category')}</th>
          <th className="font-medium">{t('brand')}</th>
          {shared ? <th className="font-medium">{t('yourDiscount')}</th> : null}
          <th className="font-medium">{t('status')}</th>
          <th className="font-medium">{t('validity')}</th>
          <th className="font-medium">{t('tags')}</th>
          <th className="text-right font-medium">{t('actions')}</th>
        </tr>
      </thead>
      <tbody>
        {families.map((family) => {
          const open = expandedId === family.id
          const validity = { priceValidFrom: family.priceValidFrom, priceValidTo: family.priceValidTo }
          return (
            <Fragment key={family.id}>
              <tr
                className={cn('cursor-pointer border-b border-slate-50 hover:bg-slate-50/80', open && 'border-b-0 bg-slate-50/80')}
                onClick={(event) => onRowClick(family.id, event)}
              >
                <td>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={t(open ? 'collapse' : 'expand', { name: family.name })}
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      onClick={(event) => {
                        event.stopPropagation()
                        toggle(family.id)
                      }}
                    >
                      <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
                    </button>
                    <Link
                      href={`/app/product-families/${family.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('openInNewTab', { name: family.name })}
                      title={t('openInNewTab', { name: family.name })}
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    <QuickLookButton label={t('quickLook')}>
                      {(close) => <FamilyQuickLook familyId={family.id} onClose={close} />}
                    </QuickLookButton>
                  </div>
                </td>
                <td className="min-w-[11rem] font-medium text-slate-900">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/app/product-families/${family.id}`} className="hover:text-brand">
                      {family.name}
                    </Link>
                    <Badge
                      variant="muted"
                      className="whitespace-nowrap"
                      title={tVersion('versionBadge', { version: family.version })}
                    >
                      {tVersion('short', { version: family.version })}
                    </Badge>
                    <FavoriteFamilyButton family={family} />
                    {family.archivedAt ? <Badge variant="warning">{t('archivedBadge')}</Badge> : null}
                  </div>
                </td>
                {shared ? <td className="text-slate-600">{family.ownerCompanyName ?? '—'}</td> : null}
                <td className="text-slate-600">{family.category ?? '—'}</td>
                <td className="text-slate-600">{family.brand ?? '—'}</td>
                {shared ? <td className="text-slate-600">{family.shareDiscountPct ? `${family.shareDiscountPct}%` : '—'}</td> : null}
                <td>
                  <Badge variant={family.isPublished ? 'success' : 'muted'}>
                    {family.isPublished ? t('published') : t('draft')}
                  </Badge>
                </td>
                <td>
                  <ValidityCell validity={validity} today={today} />
                </td>
                <td>
                  <TagsCell family={family} />
                </td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <ProductFamilyShareButton
                      familyId={family.id}
                      familyName={family.name}
                      isPublished={family.isPublished}
                      iconOnly
                    />
                    {tab === 'own' ? (
                      <ProductFamilyRowActions
                        familyId={family.id}
                        familyName={family.name}
                        isPublished={family.isPublished}
                        readyForInvoicing={family.readyForInvoicing}
                        validity={family}
                        showPublish={false}
                        showDelete={false}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
              {open ? (
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <td colSpan={columnCount} className="whitespace-normal">
                    <ExpandedFamily family={family} tab={tab} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

/** Marks this version as a favorite for the company. Other versions of the chain stay as they are. */
const FavoriteFamilyButton = ({ family }: { family: ProductFamilySummary }) => {
  const t = useTranslations('productFamilies')
  const tVersion = useTranslations('productFamilyVersion')
  const { can } = useAuth()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const canEdit = can('catalog.edit')
  const favorite = Boolean(family.isFavorite)
  if (!canEdit && !favorite) return null
  const code = tVersion('short', { version: family.version })

  const toggle = async () => {
    setBusy(true)
    try {
      const response = await fetch(`/api/product-families/${family.id}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !favorite }),
      })
      if (!response.ok) {
        showToast(t('favoriteFailed'), 'error')
        return
      }
      router.refresh()
    } catch {
      showToast(t('favoriteFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit) return <Star className="h-3.5 w-3.5 fill-sky-500 text-sky-500" aria-label={t('favorite', { code })} />

  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={t(favorite ? 'unfavorite' : 'favorite', { code })}
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation()
        void toggle()
      }}
      className="rounded p-0.5 text-slate-300 hover:bg-white hover:text-sky-500 disabled:opacity-50"
    >
      <Star className={cn('h-3.5 w-3.5', favorite && 'fill-sky-500 text-sky-500')} />
    </button>
  )
}

/** Soft-delete for company admins. Other versions of the chain stay as they are. */
const ArchiveFamilyButton = ({ family }: { family: ProductFamilySummary }) => {
  const t = useTranslations('productFamilies')
  const { hasRole } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!hasRole('company-admin', 'super-admin')) return null
  const archived = Boolean(family.archivedAt)

  const confirm = async () => {
    setBusy(true)
    try {
      const response = await fetch(`/api/product-families/${family.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !archived }),
      })
      if (!response.ok) {
        showToast(t('archiveFailed'), 'error')
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      showToast(t('archiveFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => setOpen(true)}>
        {archived ? t('restore') : t('archive')}
      </Button>
      <ConfirmDialog
        open={open}
        title={archived ? t('restoreConfirmTitle') : t('archiveConfirmTitle')}
        description={archived ? t('restoreConfirmDescription', { name: family.name }) : t('archiveConfirmDescription', { name: family.name })}
        confirmLabel={archived ? t('restore') : t('archive')}
        cancelLabel={t('cancel')}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
