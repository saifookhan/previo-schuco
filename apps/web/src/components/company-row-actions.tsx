'use client'

import { Loader2, Pencil, Power, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from '@/i18n/navigation'
import type { CompanyDto } from '@schuco/contracts'
import { CompanyCapabilitiesField } from '@/components/company-capabilities-field'
import { hasAnyCapability } from '@/lib/company-capabilities'

interface CompanyRowActionsProps {
  company: CompanyDto
}

/** Edit + activate/deactivate for one row in the super-admin companies panel. */
export const CompanyRowActions = ({ company }: CompanyRowActionsProps) => {
  const t = useTranslations('adminCompanies')
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ capabilities: company.capabilities, name: company.name, vatNumber: company.vatNumber })

  const openEdit = () => {
    setForm({ capabilities: company.capabilities, name: company.name, vatNumber: company.vatNumber })
    setError(null)
    setEditOpen(true)
  }

  const save = async () => {
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
      const response = await fetch(`/api/admin/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ? `${t('saveFailed')}: ${data.error}` : t('saveFailed'))
        return
      }
      setEditOpen(false)
      router.refresh()
    } catch {
      setError(t('saveFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async () => {
    setTogglingActive(true)
    try {
      await fetch(`/api/admin/companies/${company.id}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !company.isActive }),
      })
      router.refresh()
    } finally {
      setTogglingActive(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={openEdit}
        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
        aria-label={t('edit')}
        title={t('edit')}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={togglingActive}
        onClick={() => void toggleActive()}
        className={
          company.isActive
            ? 'rounded-md p-1.5 text-slate-400 hover:bg-red-950/50 hover:text-red-400 disabled:opacity-50'
            : 'rounded-md p-1.5 text-slate-400 hover:bg-emerald-950/50 hover:text-emerald-400 disabled:opacity-50'
        }
        aria-label={company.isActive ? t('deactivate') : t('activate')}
        title={company.isActive ? t('deactivate') : t('activate')}
      >
        {togglingActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
      </button>

      {editOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-6"
          onClick={() => !saving && setEditOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-md overflow-auto rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{t('editCompanyTitle')}</p>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <CompanyCapabilitiesField
                idPrefix={`company-edit-cap-${company.id}`}
                value={form.capabilities}
                onChange={(capabilities) => setForm((f) => ({ ...f, capabilities }))}
              />
              <div className="space-y-1">
                <Label htmlFor={`company-edit-name-${company.id}`}>{t('fieldName')}</Label>
                <Input
                  id={`company-edit-name-${company.id}`}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`company-edit-vat-${company.id}`}>{t('fieldVatNumber')}</Label>
                <Input
                  id={`company-edit-vat-${company.id}`}
                  value={form.vatNumber}
                  onChange={(e) => setForm((f) => ({ ...f, vatNumber: e.target.value }))}
                />
              </div>
            </div>

            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setEditOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="button" disabled={saving} className="gap-2" onClick={() => void save()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? t('saving') : t('save')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
