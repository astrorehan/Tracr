import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

/** Centered dialog on desktop, bottom sheet on mobile. */
export function Modal({ open, onClose, title, children, className }: ModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[6px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'card-surface relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-[28px] border border-border bg-surface p-6 shadow-lg sm:rounded-[22px]',
          'animate-slide-up sm:animate-pop',
          className,
        )}
      >
        {/* Pull tab indicator for bottom sheets on mobile */}
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border sm:hidden" />
        
        {title && (
          <div className="mb-5 flex items-center justify-between">
            <h2 className="section-head text-[22px] text-foreground">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
