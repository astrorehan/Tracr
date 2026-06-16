import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from './confirm-context'

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const resolve = useCallback((value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && <ConfirmDialog options={options} onResolve={resolve} />}
    </ConfirmContext.Provider>
  )
}

function ConfirmDialog({
  options,
  onResolve,
}: {
  options: ConfirmOptions
  onResolve: (value: boolean) => void
}) {
  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'default',
  } = options

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onResolve(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onResolve])

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[6px] animate-fade-in"
        onClick={() => onResolve(false)}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className="card-surface animate-slide-up relative w-full max-w-sm rounded-t-[28px] border border-border bg-surface p-6 shadow-lg sm:animate-pop sm:rounded-[24px]"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border sm:hidden" />
        <h2 className="section-head text-xl text-foreground">{title}</h2>
        {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            autoFocus={tone === 'danger'}
            onClick={() => onResolve(false)}
            className="pressable h-11 flex-1 rounded-xl border border-border bg-surface text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus={tone !== 'danger'}
            onClick={() => onResolve(true)}
            className={cn(
              'pressable h-11 flex-1 rounded-xl text-sm font-semibold transition-all hover:brightness-110',
              tone === 'danger'
                ? 'bg-negative text-white'
                : 'bg-primary text-primary-foreground',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
