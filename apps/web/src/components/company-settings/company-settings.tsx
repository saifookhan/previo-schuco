'use client'

import {
  LOGO_MAX_BYTES,
  type BusinessUnit,
  type BusinessUnitInput,
  type CompanyProfile,
  type CompanyProfileResponse,
  type TextTemplate,
} from '@schuco/contracts'
import { Building2, Loader2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { RichTextModule } from '@/components/quote-editor/rich-text-module'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { showToast } from '@/lib/toast'

const errorMessage = async (response: Response, fallback: string): Promise<string> => {
  const body = (await response.json().catch(() => null)) as { error?: string; issues?: { message: string }[] } | null
  return body?.issues?.[0]?.message ?? body?.error ?? fallback
}

const send = async <T,>(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> => {
  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) return { ok: false, error: await errorMessage(response, String(response.status)) }
    return { ok: true, data: (await response.json()) as T }
  } catch {
    return { ok: false, error: 'unreachable' }
  }
}

const orNull = (value: string) => value.trim() || null

// ── Company (fiscal data in every page's footer) ─────────────────────────────

const ProfileCard = ({ initial, onSaved }: { initial: CompanyProfile; onSaved: (response: CompanyProfileResponse) => void }) => {
  const t = useTranslations('settingsCompany')
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  // The legal name and VAT number identify the company to its partners: only a super-admin changes them.
  const text = (key: keyof CompanyProfile, label: string, readOnly = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`company-${key}`}>{label}</Label>
      <Input
        id={`company-${key}`}
        value={form[key] ?? ''}
        disabled={readOnly}
        title={readOnly ? t('managedBySuperAdmin') : undefined}
        onChange={(event) => setForm((f) => ({ ...f, [key]: event.target.value }))}
      />
    </div>
  )
  const save = async () => {
    setSaving(true)
    const result = await send<CompanyProfileResponse>('/api/company/profile', 'PUT', {
      fiscalAddress: orNull(form.fiscalAddress ?? ''),
      fiscalCode: orNull(form.fiscalCode ?? ''),
      sdiCode: orNull(form.sdiCode ?? ''),
      email: orNull(form.email ?? ''),
      pecEmail: orNull(form.pecEmail ?? ''),
      phone: orNull(form.phone ?? ''),
    })
    setSaving(false)
    if (!result.ok) {
      showToast(t('saveFailed', { error: result.error }), 'error')
      return
    }
    onSaved(result.data)
    showToast(t('savedSuccessfully'))
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('companyDetails')}</CardTitle>
        <p className="text-sm text-slate-500">{t('companyDetailsHint')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{text('name', t('fieldName'), true)}</div>
          {text('vatNumber', t('fieldVatNumber'), true)}
          {text('fiscalCode', t('fieldFiscalCode'))}
          <div className="sm:col-span-2">{text('fiscalAddress', t('fieldFiscalAddress'))}</div>
          {text('sdiCode', t('fieldSdiCode'))}
          {text('phone', t('fieldPhone'))}
          {text('email', t('fieldEmail'))}
          {text('pecEmail', t('fieldPecEmail'))}
        </div>
        <p className="text-xs text-slate-400">{t('managedBySuperAdmin')}</p>
        <Button disabled={saving} onClick={() => void save()} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('saveChanges')}
        </Button>
      </CardContent>
    </Card>
  )
}

// ── Branches (logo, name and contacts in every page's header) ────────────────

const emptyUnit = (): BusinessUnitInput => ({ name: '', address: null, email: null, phone: null, primaryColor: '#1E5F8C', logoDataUrl: null, userIds: [] })

const UnitForm = ({
  initial,
  contacts,
  onCancel,
  onSave,
}: {
  initial: BusinessUnitInput
  contacts: CompanyProfileResponse['salesContacts']
  onCancel: () => void
  onSave: (input: BusinessUnitInput) => Promise<boolean>
}) => {
  const t = useTranslations('settingsCompany')
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<BusinessUnitInput>) => setForm((f) => ({ ...f, ...patch }))

  const chooseLogo = (file: File | undefined) => {
    if (!file) return
    if (file.size > LOGO_MAX_BYTES) {
      showToast(t('logoTooLarge'), 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => set({ logoDataUrl: String(reader.result) })
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="unit-name">
            {t('unitName')}
            <span className="text-red-500"> *</span>
          </Label>
          <Input id="unit-name" value={form.name} onChange={(event) => set({ name: event.target.value })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="unit-address">{t('unitAddress')}</Label>
          <Input id="unit-address" value={form.address ?? ''} onChange={(event) => set({ address: event.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit-email">{t('fieldEmail')}</Label>
          <Input id="unit-email" value={form.email ?? ''} onChange={(event) => set({ email: event.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit-phone">{t('fieldPhone')}</Label>
          <Input id="unit-phone" value={form.phone ?? ''} onChange={(event) => set({ phone: event.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit-color">{t('unitColor')}</Label>
          <div className="flex items-center gap-2">
            <input
              id="unit-color"
              type="color"
              value={form.primaryColor}
              onChange={(event) => set({ primaryColor: event.target.value.toUpperCase() })}
              className="h-9 w-12 cursor-pointer rounded border border-slate-200"
            />
            <span className="font-mono text-xs text-slate-500">{form.primaryColor}</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t('unitLogo')}</Label>
          <div className="flex items-center gap-3">
            {form.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data URL picked by the user
              <img src={form.logoDataUrl} alt="" className="h-9 max-w-[120px] object-contain" />
            ) : (
              <span className="text-xs text-slate-400">{t('noLogo')}</span>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5" />
              {t('uploadLogo')}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(event) => chooseLogo(event.target.files?.[0])} />
            </label>
            {form.logoDataUrl ? (
              <button type="button" onClick={() => set({ logoDataUrl: null })} className="text-xs text-slate-500 underline hover:text-red-600">
                {t('removeLogo')}
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-slate-400">{t('logoHint')}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t('unitUsers')}</Label>
        <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 sm:grid-cols-2">
          {contacts.map((contact) => (
            <label key={contact.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.userIds.includes(contact.id)}
                onChange={(event) =>
                  set({ userIds: event.target.checked ? [...form.userIds, contact.id] : form.userIds.filter((id) => id !== contact.id) })
                }
              />
              <span className="truncate">{contact.name || contact.email}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={saving} onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button
          disabled={saving || !form.name.trim()}
          className="gap-2"
          onClick={async () => {
            setSaving(true)
            const saved = await onSave({
              ...form,
              name: form.name.trim(),
              address: orNull(form.address ?? ''),
              email: orNull(form.email ?? ''),
              phone: orNull(form.phone ?? ''),
            })
            setSaving(false)
            if (saved) onCancel()
          }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('saveUnit')}
        </Button>
      </div>
    </div>
  )
}

const UnitsCard = ({ data, onChange }: { data: CompanyProfileResponse; onChange: (response: CompanyProfileResponse) => void }) => {
  const t = useTranslations('settingsCompany')
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  const save = async (unit: BusinessUnit | null, input: BusinessUnitInput) => {
    const result = unit
      ? await send<CompanyProfileResponse>(`/api/company/business-units/${unit.id}`, 'PUT', input)
      : await send<CompanyProfileResponse>('/api/company/business-units', 'POST', input)
    if (!result.ok) {
      showToast(t('saveFailed', { error: result.error }), 'error')
      return false
    }
    onChange(result.data)
    showToast(t('savedSuccessfully'))
    return true
  }
  const remove = async (unit: BusinessUnit) => {
    if (!window.confirm(t('deleteUnitConfirm', { name: unit.name }))) return
    const result = await send<CompanyProfileResponse>(`/api/company/business-units/${unit.id}`, 'DELETE')
    if (!result.ok) {
      showToast(t('saveFailed', { error: result.error }), 'error')
      return
    }
    onChange(result.data)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{t('businessUnits')}</CardTitle>
          <p className="text-sm text-slate-500">{t('businessUnitsHint')}</p>
        </div>
        {editing === null ? (
          <Button variant="outline" className="gap-1.5" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            {t('addUnit')}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {editing === 'new' ? <UnitForm initial={emptyUnit()} contacts={data.salesContacts} onCancel={() => setEditing(null)} onSave={(input) => save(null, input)} /> : null}
        {data.businessUnits.length === 0 && editing !== 'new' ? <p className="text-sm text-slate-400">{t('noUnits')}</p> : null}
        {data.businessUnits.map((unit) =>
          editing === unit.id ? (
            <UnitForm
              key={unit.id}
              initial={{ name: unit.name, address: unit.address, email: unit.email, phone: unit.phone, primaryColor: unit.primaryColor, logoDataUrl: unit.logoDataUrl, userIds: unit.userIds }}
              contacts={data.salesContacts}
              onCancel={() => setEditing(null)}
              onSave={(input) => save(unit, input)}
            />
          ) : (
            <div key={unit.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3" style={{ borderLeft: `4px solid ${unit.primaryColor}` }}>
              {unit.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data URL from the company profile
                <img src={unit.logoDataUrl} alt="" className="h-8 max-w-[90px] object-contain" />
              ) : (
                <Building2 className="h-6 w-6 text-slate-300" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: unit.primaryColor }}>
                  {unit.name}
                </p>
                <p className="truncate text-xs text-slate-500">{[unit.address, unit.email, unit.phone].filter(Boolean).join(' · ') || '—'}</p>
                <p className="text-xs text-slate-400">{t('unitUsersCount', { count: unit.userIds.length })}</p>
              </div>
              <button type="button" onClick={() => setEditing(unit.id)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label={t('editUnit')}>
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => void remove(unit)} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label={t('deleteUnit')}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ),
        )}
      </CardContent>
    </Card>
  )
}

// ── Sales contacts ("Vostro referente": name, email and phone) ───────────────

const ContactsCard = ({ data, onChange }: { data: CompanyProfileResponse; onChange: (response: CompanyProfileResponse) => void }) => {
  const t = useTranslations('settingsCompany')
  const [phones, setPhones] = useState<Record<string, string>>(() => Object.fromEntries(data.salesContacts.map((c) => [c.id, c.phone ?? ''])))
  const [saving, setSaving] = useState<string | null>(null)
  const save = async (userId: string) => {
    setSaving(userId)
    const result = await send<CompanyProfileResponse>(`/api/company/sales-contacts/${userId}`, 'PUT', { phone: orNull(phones[userId] ?? '') })
    setSaving(null)
    if (!result.ok) {
      showToast(t('saveFailed', { error: result.error }), 'error')
      return
    }
    onChange(result.data)
    showToast(t('savedSuccessfully'))
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('salesContacts')}</CardTitle>
        <p className="text-sm text-slate-500">{t('salesContactsHint')}</p>
      </CardHeader>
      <CardContent className="divide-y divide-slate-100 p-0">
        {data.salesContacts.map((contact) => {
          const changed = (phones[contact.id] ?? '') !== (contact.phone ?? '')
          return (
            <div key={contact.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
              <div className="min-w-[180px] flex-1">
                <p className="text-sm font-medium text-slate-800">{contact.name || contact.email}</p>
                <p className="text-xs text-slate-500">{contact.email}</p>
              </div>
              <Input
                className="w-48"
                value={phones[contact.id] ?? ''}
                placeholder={t('fieldPhone')}
                aria-label={t('phoneOf', { name: contact.name || contact.email })}
                onChange={(event) => setPhones((p) => ({ ...p, [contact.id]: event.target.value }))}
              />
              <Button variant="outline" disabled={!changed || saving === contact.id} onClick={() => void save(contact.id)} className="gap-2">
                {saving === contact.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('save')}
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ── Saved texts (to start a quote's text modules from) ───────────────────────

const TemplatesCard = ({ initial }: { initial: TextTemplate[] }) => {
  const t = useTranslations('settingsCompany')
  const [templates, setTemplates] = useState(initial)
  const [editing, setEditing] = useState<{ id: string | null; name: string; html: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!editing) return
    setSaving(true)
    const body = { name: editing.name.trim(), html: editing.html }
    const result = editing.id
      ? await send<TextTemplate>(`/api/company/text-templates/${editing.id}`, 'PUT', body)
      : await send<TextTemplate>('/api/company/text-templates', 'POST', body)
    setSaving(false)
    if (!result.ok) {
      showToast(t('saveFailed', { error: result.error }), 'error')
      return
    }
    setTemplates((current) => [...current.filter((tpl) => tpl.id !== result.data.id), result.data].sort((a, b) => a.name.localeCompare(b.name)))
    setEditing(null)
    showToast(t('savedSuccessfully'))
  }
  const remove = async (template: TextTemplate) => {
    if (!window.confirm(t('deleteTemplateConfirm', { name: template.name }))) return
    const result = await send<{ ok: true }>(`/api/company/text-templates/${template.id}`, 'DELETE')
    if (!result.ok) {
      showToast(t('saveFailed', { error: result.error }), 'error')
      return
    }
    setTemplates((current) => current.filter((tpl) => tpl.id !== template.id))
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{t('textTemplates')}</CardTitle>
          <p className="text-sm text-slate-500">{t('textTemplatesHint')}</p>
        </div>
        {editing === null ? (
          <Button variant="outline" className="gap-1.5" onClick={() => setEditing({ id: null, name: '', html: '' })}>
            <Plus className="h-4 w-4" />
            {t('addTemplate')}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="template-name">{t('templateName')}</Label>
              <Input id="template-name" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
            </div>
            <div className="rounded-lg border border-slate-300 bg-white">
              <RichTextModule key={editing.id ?? 'new'} html={editing.html} onChange={(html) => setEditing((current) => (current ? { ...current, html } : current))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={saving} onClick={() => setEditing(null)} className="gap-1.5">
                <X className="h-4 w-4" />
                {t('cancel')}
              </Button>
              <Button disabled={saving || !editing.name.trim()} onClick={() => void save()} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('save')}
              </Button>
            </div>
          </div>
        ) : null}
        {templates.length === 0 && !editing ? <p className="text-sm text-slate-400">{t('noTemplates')}</p> : null}
        {templates.map((template) => (
          <div key={template.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{template.name}</p>
              <p className="line-clamp-2 text-xs text-slate-500">{template.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '—'}</p>
            </div>
            <button
              type="button"
              onClick={() => setEditing({ id: template.id, name: template.name, html: template.html })}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label={t('editTemplate')}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void remove(template)}
              className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
              aria-label={t('deleteTemplate')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/** The company profile the printed quotes take their header, footer and sales contact from, and the saved texts. */
export const CompanySettings = ({ initialProfile, initialTemplates }: { initialProfile: CompanyProfileResponse; initialTemplates: TextTemplate[] }) => {
  const [data, setData] = useState(initialProfile)
  return (
    <div className="max-w-3xl space-y-6">
      <ProfileCard initial={data.profile} onSaved={setData} />
      <UnitsCard data={data} onChange={setData} />
      <ContactsCard key={data.salesContacts.map((c) => `${c.id}:${c.phone ?? ''}`).join(',')} data={data} onChange={setData} />
      <TemplatesCard initial={initialTemplates} />
    </div>
  )
}
