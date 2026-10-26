'use client'

import { Loader2, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from '@/i18n/navigation'
import type { CompanyCapabilities, CompanyDto } from '@schuco/contracts'
import { CompanyCapabilitiesField } from '@/components/company-capabilities-field'
import { useLoadingTransition } from '@/components/ui/loading-region'
import { hasAnyCapability } from '@/lib/company-capabilities'

const DEFAULT_CAPABILITIES: CompanyCapabilities = { platform: false, manufacturer: false, supplier: false, client: true }

/** "New company" button + modal for the super-admin companies panel. */
export const CompanyCreateButton = () => {
  const t = useTranslations('adminCompanies')
  const router = useRouter()
  // Refreshes run in the table's loading region, so the list shows it is reloading (ADR 0014).
  const { startTransition } = useLoadingTransition()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ capabilities: DEFAULT_CAPABILITIES, name: '', vatNumber: '' })

  const openDialog = () => {
    setForm({ capabilities: DEFAULT_CAPABILITIES, name: '', vatNumber: '' })
    setError(null)
    setOpen(true)
  }

  const create = async () => {
    if (!form.name.trim() || !form.vatNumber.trim()) {
      setError(t('createRequired'))
      return
    }
    if (!hasAnyCapability(form.capabilities)) {
      setError(t('capabilityRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = (await response.json().catch(() => ({}))) as { company?: CompanyDto; error?: string }
      if (!response.ok || !data.company) {
        setError(data.error ? `${t('createFailed')}: ${data.error}` : t('createFailed'))
        return
      }
      setOpen(false)
      startTransition(() => router.refresh())
    } catch {
      setError(t('createFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="button" className="gap-2" onClick={openDialog}>
        <Plus className="h-4 w-4" />
        {t('newCompany')}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-6"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-md overflow-auto rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{t('newCompanyTitle')}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <CompanyCapabilitiesField
                idPrefix="company-new-cap"
                value={form.capabilities}
                onChange={(capabilities) => setForm((f) => ({ ...f, capabilities }))}
              />
              <div className="space-y-1">
                <Label htmlFor="company-new-name">{t('fieldName')}</Label>
                <Input
                  id="company-new-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="company-new-vat">{t('fieldVatNumber')}</Label>
                <Input
                  id="company-new-vat"
                  value={form.vatNumber}
                  onChange={(e) => setForm((f) => ({ ...f, vatNumber: e.target.value }))}
                />
              </div>
            </div>

            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="button" disabled={saving} className="gap-2" onClick={() => void create()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? t('creating') : t('create')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
