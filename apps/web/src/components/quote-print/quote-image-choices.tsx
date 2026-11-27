'use client'

import { useTranslations } from 'next-intl'

/** One uploaded family photo the quote can include in its PDF. */
export interface PrintImageChoice {
  id: string
  productFamilyId: string
  title: string | null
  familyName: string
  sortOrder: number
}

interface QuoteImageChoicesProps {
  images: PrintImageChoice[]
  /** Ids left out of the PDF. A photo that is not listed here is included. */
  excludedIds: readonly string[]
  disabled?: boolean
  /** `row` wraps the photos on one line (the PDF preview). `column` stacks them (the print-settings menu). */
  layout?: 'row' | 'column'
  onToggle: (imageId: string) => void
}

const caption = (image: PrintImageChoice): string => image.title?.trim() || image.familyName

/** A checkbox per photo. Checked photos are the ones that print. */
export const QuoteImageChoices = ({ images, excludedIds, disabled = false, layout = 'column', onToggle }: QuoteImageChoicesProps) => {
  const t = useTranslations('quotePrint')
  if (images.length === 0) return null
  const excluded = new Set(excludedIds)
  return (
    <div>
      <p className="mb-2 text-[11px] text-slate-500">{t('chooseImagesHint')}</p>
      <ul className={layout === 'row' ? 'flex flex-wrap gap-x-4 gap-y-2' : 'flex flex-col gap-1.5'}>
        {images.map((image) => {
          const title = caption(image)
          const checked = !excluded.has(image.id)
          return (
            <li key={image.id}>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand"
                  checked={checked}
                  disabled={disabled}
                  aria-label={t('includeImage', { title })}
                  onChange={() => onToggle(image.id)}
                />
                {/* eslint-disable-next-line @next/next/no-img-element -- same-origin authenticated image */}
                <img
                  src={`/api/product-families/${image.productFamilyId}/images/${image.id}`}
                  alt=""
                  className="h-10 w-10 rounded border border-slate-200 object-cover"
                />
                <span className="min-w-0 truncate">
                  {title}
                  {image.title?.trim() && image.familyName ? <span className="ml-1 text-[11px] text-slate-400">{image.familyName}</span> : null}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
