'use client'

import { Loader2, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from '@/i18n/navigation'
import type { CreateSalesQuoteRequest, SalesQuoteDetailResponse } from '@schuco/contracts'

/**
 * "New quote" button + modal: the reference and the customer, then straight into the quote
 * builder for the new draft (where the customer and project can still be changed).
 */
export const QuoteNewButton = () => {
  const t = useTranslations('quotes')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    reference: '',
    customerName: '',
    customerFiscalCode: '',
    customerAddress: '',
    customerCity: '',
    projectLocation: '',
  })

  const openDialog = () => {
    setForm({
      reference: '',
      customerName: '',
      customerFiscalCode: '',
      customerAddress: '',
      customerCity: '',
      projectLocation: '',
    })
    setError(null)
    setOpen(true)
  }

  const create = async () => {
    if (!form.reference.trim() || !form.customerName.trim()) {
      setError(t('newQuoteRequired'))
      return
    }

    setSaving(true)
    setError(null)
    try {
      const orNull = (value: string) => value.trim() || null
      const body: CreateSalesQuoteRequest = {
        reference: form.reference.trim(),
        header: {
          customerName: form.customerName.trim(),
          customerFiscalCode: orNull(form.customerFiscalCode),
          customerAddress: orNull(form.customerAddress),
          customerCity: orNull(form.customerCity),
          projectLocation: orNull(form.projectLocation),
        },
      }
      const response = await fetch('/api/sales-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await response.json().catch(() => ({}))) as Partial<SalesQuoteDetailResponse> & { error?: string }
      if (!response.ok || !data.quote) {
        setError(data.error ? `${t('newQuoteFailed')}: ${data.error}` : t('newQuoteFailed'))
        return
      }
      router.push(`/app/quotes/${data.quote.id}`)
    } catch {
      setError(t('newQuoteFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof typeof form, label: string, required?: boolean) => (
    <div className="space-y-1" key={key}>
      <Label htmlFor={`quote-new-${key}`}>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </Label>
      <Input
        id={`quote-new-${key}`}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <>
      <Button type="button" className="gap-2" onClick={openDialog}>
        <Plus className="h-4 w-4" />
        {t('newQuote')}
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
              <p className="text-sm font-semibold text-slate-900">{t('newQuoteTitle')}</p>
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
              {field('reference', t('fieldReference'), true)}
              {field('customerName', t('fieldCustomerName'), true)}
              {field('customerFiscalCode', t('fieldCustomerFiscalCode'))}
              {field('customerAddress', t('fieldCustomerAddress'))}
              {field('customerCity', t('fieldCustomerCity'))}
              {field('projectLocation', t('fieldProjectLocation'))}
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
