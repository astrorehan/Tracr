import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  /** Optional one-line context under the title. */
  description?: string
  children: ReactNode
  className?: string
}

/** Centered dialog on desktop, bottom sheet on mobile. The title row sticks to
 *  the top while the body scrolls, so long forms keep their heading and close
 *  button in reach. */
export function Modal({ open, onClose, title, description, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[6px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'card-surface relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border border-border bg-surface shadow-lg sm:rounded-[24px]',
          'animate-slide-up sm:animate-pop',
          className,
        )}
      >
        {title && (
          <header className="relative shrink-0 border-b border-border bg-surface px-6 pb-4 pt-5">
            {/* Pull tab indicator for bottom sheets on mobile */}
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border sm:hidden" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="section-head text-[22px] leading-tight text-foreground">{title}</h2>
                {description && (
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="pressable -mr-1.5 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {/* Untitled sheets still need a grab handle on mobile */}
          {!title && <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border sm:hidden" />}
          {children}
        </div>
      </div>
    </div>
  )
}
