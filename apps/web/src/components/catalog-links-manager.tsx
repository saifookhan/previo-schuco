'use client'

import { Link2, Loader2, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useRouter } from '@/i18n/navigation'
import type { CatalogLinkDto, CompanyDto } from '@schuco/contracts'

const selectClassName =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50'

/** Add/remove manufacturer → supplier/client catalog links (super-admin). */
export const CatalogLinksManager = ({ links, companies }: { links: CatalogLinkDto[]; companies: CompanyDto[] }) => {
  const t = useTranslations('adminLinks')
  const router = useRouter()
  const manufacturers = companies.filter((c) => c.capabilities.manufacturer)
  const partners = companies.filter((c) => c.capabilities.supplier || c.capabilities.client)
  const [manufacturerId, setManufacturerId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [saving, setSaving] = useState(false)
  const [removingKey, setRemovingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const add = async () => {
    if (!manufacturerId || !partnerId) {
      setError(t('selectBoth'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturerCompanyId: manufacturerId, partnerCompanyId: partnerId }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ? `${t('addFailed')}: ${data.error}` : t('addFailed'))
        return
      }
      setPartnerId('')
      router.refresh()
    } catch {
      setError(t('addFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (link: CatalogLinkDto) => {
    const key = `${link.manufacturerCompanyId}:${link.partnerCompanyId}`
    setRemovingKey(key)
    setError(null)
    try {
      const response = await fetch(`/api/admin/links/${link.manufacturerCompanyId}/${link.partnerCompanyId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        setError(t('removeFailed'))
        return
      }
      router.refresh()
    } catch {
      setError(t('removeFailed'))
    } finally {
      setRemovingKey(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="link-manufacturer" className="text-slate-300">
              {t('manufacturer')}
            </Label>
            <select
              id="link-manufacturer"
              className={selectClassName}
              value={manufacturerId}
              onChange={(e) => setManufacturerId(e.target.value)}
            >
              <option value="">{t('choose')}</option>
              {manufacturers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-partner" className="text-slate-300">
              {t('partner')}
            </Label>
            <select
              id="link-partner"
              className={selectClassName}
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
            >
              <option value="">{t('choose')}</option>
              {partners
                .filter((c) => c.id !== manufacturerId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <Button type="button" disabled={saving} className="gap-2" onClick={() => void add()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {saving ? t('adding') : t('addLink')}
          </Button>
        </div>
        {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="px-6 py-3 font-medium">{t('manufacturer')}</th>
              <th className="px-6 py-3 font-medium">{t('partner')}</th>
              <th className="px-6 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {links.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              links.map((link) => {
                const key = `${link.manufacturerCompanyId}:${link.partnerCompanyId}`
                return (
                  <tr key={key} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-6 py-4 font-medium text-white">{link.manufacturerName}</td>
                    <td className="px-6 py-4 text-slate-300">{link.partnerName}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        disabled={removingKey === key}
                        onClick={() => void remove(link)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-red-400 disabled:opacity-50"
                        aria-label={t('remove')}
                        title={t('remove')}
                      >
                        {removingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
