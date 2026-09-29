'use client'

import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'
import { dismissToast, subscribeToasts, type ToastMessage } from '@/lib/toast'

/** Renders whatever's in the module-level toast store (see `@/lib/toast`). Mount once per shell. */
export const Toaster = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="fixed left-1/2 top-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 sm:left-auto sm:right-4 sm:top-4 sm:w-full sm:translate-x-0">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-start gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-700 shadow-lg',
            toast.variant === 'success' ? 'border-green-200' : 'border-red-200',
          )}
        >
          {toast.variant === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
          )}
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            className="flex-shrink-0 text-slate-400 hover:text-slate-600"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
