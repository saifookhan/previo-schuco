'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEMO_COMPANY, type CompanyDetails } from '@/types/settings'

/**
 * Demo company details form.
 */
const CompanyPage = () => {
  const t = useTranslations('settingsCompany')
  const [company, setCompany] = useState<CompanyDetails>(DEMO_COMPANY)
  const [saved, setSaved] = useState(false)

  const update = (field: keyof CompanyDetails, value: string) => {
    setCompany((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const fields: { key: keyof CompanyDetails; label: string }[] = [
    { key: 'name', label: t('fieldName') },
    { key: 'vatNumber', label: t('fieldVatNumber') },
    { key: 'address', label: t('fieldAddress') },
    { key: 'city', label: t('fieldCity') },
    { key: 'country', label: t('fieldCountry') },
    { key: 'phone', label: t('fieldPhone') },
    { key: 'email', label: t('fieldEmail') },
    { key: 'website', label: t('fieldWebsite') },
  ]

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t('companyDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.map(({ key, label }) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                value={company[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave}>{t('saveChanges')}</Button>
            {saved && (
              <span className="text-sm text-green-600">{t('savedSuccessfully')}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default CompanyPage
