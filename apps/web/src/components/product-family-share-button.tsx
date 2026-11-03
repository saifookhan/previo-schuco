'use client'

import { Loader2, Search, Share2, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLoadingTransition } from '@/components/ui/loading-region'
import { useAuth } from '@/hooks/use-auth'
import { Link, useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import type { FamilySharesResponse } from '@schuco/contracts'

interface Row {
  companyId: string
  companyName: string
  /** Kept as text while typing so "12." and "" don't fight the input. */
  discount: string
}

/** "Share" button + dialog: choose which connected partners get this family, each with a default discount. */
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
      setRows(
        data.shares.map((share) => ({
          companyId: share.companyId,
          companyName: share.companyName,
          discount: String(share.discountPct),
        })),
      )
    } catch {
      setError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  const add = (target: { id: string; name: string }) => {
    setRows((prev) => [...prev, { companyId: target.id, companyName: target.name, discount: '0' }])
    setQuery('')
  }

  const save = async () => {
    const shares = rows.map((row) => ({ companyId: row.companyId, discountPct: Number(row.discount) }))
    if (shares.some((s) => !Number.isFinite(s.discountPct) || s.discountPct < 0 || s.discountPct > 100)) {
      setError(t('discountInvalid'))
      return
    }
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
            className="max-h-full w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl"
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
                    <>
                      <div className="grid grid-cols-[1fr_7rem_2rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">
                        <span>{t('company')}</span>
                        <span>{t('discount')}</span>
                        <span />
                      </div>
                      {rows.map((row) => (
                        <div
                          key={row.companyId}
                          className="grid grid-cols-[1fr_7rem_2rem] items-center gap-3 border-b border-slate-50 px-4 py-2 last:border-b-0"
                        >
                          <span className="truncate text-sm font-medium text-slate-900">{row.companyName}</span>
                          <div className="relative">
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={100}
                              step="0.5"
                              className="h-8 pr-7 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              value={row.discount}
                              aria-label={t('discountFor', { name: row.companyName })}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((r) => (r.companyId === row.companyId ? { ...r, discount: e.target.value } : r)),
                                )
                              }
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
                              %
                            </span>
                          </div>
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
                      ))}
                    </>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">{t('discountHint')}</p>
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
