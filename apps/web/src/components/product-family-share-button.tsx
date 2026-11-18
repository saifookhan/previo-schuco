'use client'

import { ChevronDown, Loader2, Search, Share2, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLoadingTransition } from '@/components/ui/loading-region'
import { useAuth } from '@/hooks/use-auth'
import { Link, useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { FamilyShareItemDto, FamilyShareableItem, FamilySharesResponse } from '@schuco/contracts'

const FIELDS = ['discountPct', 'markupPct', 'installationHours'] as const
type Field = (typeof FIELDS)[number]
/** One line's or option's values, kept as text while typing so "12." and "" don't fight the input. */
type Values = Record<Field, string>

interface Row {
  companyId: string
  companyName: string
  open: boolean
  /** Started from what the company got on another version of the family. */
  fromPrevious: boolean
  values: Record<string, Values>
}

const asText = (items: Array<Pick<FamilyShareItemDto, 'id' | Field>>): Record<string, Values> =>
  Object.fromEntries(
    items.map((item) => [
      item.id,
      { discountPct: String(item.discountPct), markupPct: String(item.markupPct), installationHours: String(item.installationHours) },
    ]),
  )

/** The valid range of each value: discount 0–100 %, markup 0–10000 % (100 = none), hours ≥ 0. */
const inRange = (field: Field, value: number) =>
  Number.isFinite(value) && value >= 0 && (field === 'discountPct' ? value <= 100 : field === 'markupPct' ? value <= 10000 : true)

/**
 * "Share" button + dialog: choose which connected partners get this family and, for each, the
 * discount, markup and installation hours it gets on every product line and option — starting
 * from what it got on another version of the family, else from the family's own (Excel) values.
 */
export const ProductFamilyShareButton = ({
  familyId,
  familyName,
  isPublished,
  iconOnly = false,
}: {
  familyId: string
  familyName: string
  isPublished: boolean
  /** Just the icon, for the families table where space is tight. */
  iconOnly?: boolean
}) => {
  const t = useTranslations('productFamilyShare')
  const router = useRouter()
  // Refreshes run in the table's loading region, so the list shows it is reloading (ADR 0014).
  const { startTransition } = useLoadingTransition()
  const { user, can } = useAuth()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [items, setItems] = useState<FamilyShareableItem[]>([])
  const [previous, setPrevious] = useState<FamilySharesResponse['previous']>([])
  const [targets, setTargets] = useState<Array<{ id: string; name: string }>>([])
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)

  if (!user || !can('catalog.share')) {
    return null
  }

  const openDialog = async () => {
    setOpen(true)
    setLoading(true)
    setError(null)
    setQuery('')
    setListOpen(false)
    try {
      const response = await fetch(`/api/product-families/${familyId}/shares`, { cache: 'no-store' })
      const data = (await response.json().catch(() => ({}))) as Partial<FamilySharesResponse> & { error?: string }
      if (!response.ok || !data.shares || !data.targets) {
        setError(data.error ? `${t('loadFailed')}: ${data.error}` : t('loadFailed'))
        return
      }
      setTargets(data.targets)
      setItems(data.items ?? [])
      setPrevious(data.previous ?? [])
      setRows(
        data.shares.map((share) => ({
          companyId: share.companyId,
          companyName: share.companyName,
          open: false,
          fromPrevious: false,
          values: { ...asText(data.items ?? []), ...asText(share.items) },
        })),
      )
    } catch {
      setError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  const add = (target: { id: string; name: string }) => {
    const before = previous.find((p) => p.companyId === target.id)
    setRows((prev) => [
      ...prev.map((row) => ({ ...row, open: false })),
      {
        companyId: target.id,
        companyName: target.name,
        open: true,
        fromPrevious: Boolean(before?.items.length),
        values: { ...asText(items), ...asText(before?.items ?? []) },
      },
    ])
    setQuery('')
  }

  const setValue = (companyId: string, itemId: string, field: Field, value: string) =>
    setRows((prev) =>
      prev.map((row) =>
        row.companyId === companyId ? { ...row, values: { ...row.values, [itemId]: { ...row.values[itemId], [field]: value } } } : row,
      ),
    )

  const save = async () => {
    // A blank or invalid value: open that company and say so, rather than saving a default in its place.
    const valueOf = (row: Row, itemId: string, field: Field) => row.values[itemId]?.[field]?.trim() ?? ''
    const invalid = rows.find((row) =>
      items.some((item) => FIELDS.some((f) => valueOf(row, item.id, f) === '' || !inRange(f, Number(valueOf(row, item.id, f))))),
    )
    if (invalid) {
      setRows((prev) => prev.map((row) => (row.companyId === invalid.companyId ? { ...row, open: true } : row)))
      setError(t('valuesInvalid', { name: invalid.companyName }))
      return
    }
    const shares = rows.map((row) => ({
      companyId: row.companyId,
      items: items.map((item) => ({
        kind: item.kind,
        id: item.id,
        discountPct: Number(valueOf(row, item.id, 'discountPct')),
        markupPct: Number(valueOf(row, item.id, 'markupPct')),
        installationHours: Number(valueOf(row, item.id, 'installationHours')),
      })),
    }))
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/product-families/${familyId}/shares`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shares }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ? `${t('saveFailed')}: ${data.error}` : t('saveFailed'))
        return
      }
      showToast(t('saved', { count: shares.length }))
      setOpen(false)
      startTransition(() => router.refresh())
    } catch {
      setError(t('saveFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  const available = targets.filter((c) => !rows.some((row) => row.companyId === c.id))
  const matching = available.filter((c) => c.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  return (
    <>
      <Button
        type="button"
        variant={iconOnly ? 'icon' : 'outline'}
        size={iconOnly ? 'icon' : 'sm'}
        className="gap-1.5"
        disabled={!isPublished}
        aria-label={iconOnly ? t('share') : undefined}
        title={isPublished ? (iconOnly ? t('share') : undefined) : t('publishFirst')}
        onClick={() => void openDialog()}
      >
        <Share2 className="h-3.5 w-3.5" />
        {iconOnly ? null : t('share')}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-6"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-3xl overflow-auto rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{t('title', { name: familyName })}</p>
                <p className="mt-0.5 text-xs text-slate-500">{t('hint')}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                {targets.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                    {t('noPartners')}{' '}
                    <Link href="/app/partners" className="font-medium text-brand hover:underline">
                      {t('managePartners')}
                    </Link>
                  </p>
                ) : (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="search"
                      className="pl-9"
                      value={query}
                      placeholder={t('searchPlaceholder')}
                      aria-label={t('searchPlaceholder')}
                      role="combobox"
                      aria-expanded={listOpen}
                      aria-controls="share-partner-list"
                      onFocus={() => setListOpen(true)}
                      onBlur={() => setListOpen(false)}
                      onChange={(e) => {
                        setQuery(e.target.value)
                        setListOpen(true)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && matching[0]) {
                          e.preventDefault()
                          add(matching[0])
                        } else if (e.key === 'Escape' && listOpen) {
                          e.stopPropagation()
                          setListOpen(false)
                        }
                      }}
                    />
                    {listOpen ? (
                      <ul
                        id="share-partner-list"
                        role="listbox"
                        className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                      >
                        {matching.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-slate-400">{available.length === 0 ? t('allAdded') : t('noMatches')}</li>
                        ) : (
                          matching.map((c) => (
                            <li key={c.id} role="option" aria-selected={false}>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                // Keep the focus in the search box, so its blur doesn't close the list before the click lands.
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => add(c)}
                              >
                                {c.name}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                  </div>
                )}

                <div className="mt-4 rounded-lg border border-slate-200">
                  {rows.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-400">{t('empty')}</p>
                  ) : (
                    rows.map((row) => (
                      <div key={row.companyId} className="border-b border-slate-100 last:border-b-0">
                        <div className="flex items-center gap-2 px-4 py-2">
                          <button
                            type="button"
                            aria-expanded={row.open}
                            aria-controls={`share-items-${row.companyId}`}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            onClick={() =>
                              setRows((prev) => prev.map((r) => (r.companyId === row.companyId ? { ...r, open: !r.open } : r)))
                            }
                          >
                            <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', !row.open && '-rotate-90')} />
                            <span className="truncate text-sm font-medium text-slate-900">{row.companyName}</span>
                            {row.fromPrevious ? <span className="shrink-0 text-xs text-slate-500">{t('fromPrevious')}</span> : null}
                          </button>
                          <button
                            type="button"
                            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                            aria-label={t('remove', { name: row.companyName })}
                            title={t('remove', { name: row.companyName })}
                            onClick={() => setRows((prev) => prev.filter((r) => r.companyId !== row.companyId))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {row.open ? (
                          <ShareItemsTable
                            id={`share-items-${row.companyId}`}
                            companyName={row.companyName}
                            items={items}
                            values={row.values}
                            onChange={(itemId, field, value) => setValue(row.companyId, itemId, field, value)}
                          />
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">{t('valuesHint')}</p>
              </>
            )}

            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="button" disabled={saving || loading} className="gap-2" onClick={() => void save()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? t('saving') : t('save')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

const numberInput =
  'h-8 pr-7 text-right tabular-nums [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

/** One company's discount, markup and installation hours for every line, then every option under its characteristic. */
const ShareItemsTable = ({
  id,
  companyName,
  items,
  values,
  onChange,
}: {
  id: string
  companyName: string
  items: FamilyShareableItem[]
  values: Record<string, Values>
  onChange: (itemId: string, field: Field, value: string) => void
}) => {
  const t = useTranslations('productFamilyShare')
  if (items.length === 0) {
    return (
      <p id={id} className="px-4 pb-3 text-sm text-slate-400">
        {t('noItems')}
      </p>
    )
  }
  const unit: Record<Field, string> = { discountPct: '%', markupPct: '%', installationHours: 'h' }
  const lines = items.filter((item) => item.kind === 'line')
  const groups = new Map<string, FamilyShareableItem[]>()
  for (const option of items.filter((item) => item.kind === 'option')) {
    groups.set(option.characteristicName ?? '', [...(groups.get(option.characteristicName ?? '') ?? []), option])
  }
  const sections = [
    ...(lines.length ? [{ title: t('lines'), items: lines }] : []),
    ...[...groups].map(([name, options]) => ({ title: t('optionsOf', { name }), items: options })),
  ]
  return (
    <div id={id} className="overflow-x-auto px-4 pb-3">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className="py-1.5 pr-3 text-left font-medium">
              <span className="sr-only">{t('item')}</span>
            </th>
            <th className="w-28 px-1 py-1.5 text-right font-medium">{t('discountPct')}</th>
            <th className="w-28 px-1 py-1.5 text-right font-medium">{t('markupPct')}</th>
            <th className="w-28 py-1.5 pl-1 text-right font-medium">{t('installationHours')}</th>
          </tr>
        </thead>
        {sections.map((section) => (
          <tbody key={section.title}>
            <tr>
              <th colSpan={4} scope="colgroup" className="pb-1 pt-3 text-left text-xs font-semibold text-slate-700">
                {section.title}
              </th>
            </tr>
            {section.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-50">
                <th scope="row" className="max-w-0 py-1 pr-3 text-left font-normal text-slate-700">
                  <span className="block truncate" title={item.name}>
                    {item.name}
                  </span>
                </th>
                {FIELDS.map((field) => (
                  <td key={field} className="px-1 py-1 last:pr-0">
                    <div className="relative">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        className={numberInput}
                        value={values[item.id]?.[field] ?? ''}
                        aria-label={t(`${field}For`, { item: item.name, name: companyName })}
                        onChange={(e) => onChange(item.id, field, e.target.value)}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-slate-400">
                        {unit[field]}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}
