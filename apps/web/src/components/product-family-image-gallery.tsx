'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { ProductFamilyImage } from '@/types/product-family'

interface ProductFamilyImageGalleryProps {
  familyId: string
  familyName: string
  images: ProductFamilyImage[]
}

/** Thumbnail strip that opens a full-size lightbox on click. */
export const ProductFamilyImageGallery = ({ familyId, familyName, images }: ProductFamilyImageGalleryProps) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  useEffect(() => {
    if (openIndex === null) {
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenIndex(null)
      } else if (e.key === 'ArrowRight') {
        setOpenIndex((i) => (i === null ? null : (i + 1) % images.length))
      } else if (e.key === 'ArrowLeft') {
        setOpenIndex((i) => (i === null ? null : (i - 1 + images.length) % images.length))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openIndex, images.length])

  if (images.length === 0) {
    return null
  }

  const imageUrl = (imageId: string) => `/api/product-families/${familyId}/images/${imageId}`

  return (
    <>
      <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {images.map((image, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={image.id}
            src={imageUrl(image.id)}
            alt={image.title ?? familyName}
            onClick={() => setOpenIndex(index)}
            className="aspect-square w-full cursor-zoom-in rounded-lg border border-slate-200 object-cover transition-opacity hover:opacity-90"
          />
        ))}
      </div>

      {openIndex !== null ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-6"
          onClick={() => setOpenIndex(null)}
        >
          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(images[openIndex].id)}
            alt={images[openIndex].title ?? familyName}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          {images.length > 1 ? (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
              {openIndex + 1} / {images.length}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
