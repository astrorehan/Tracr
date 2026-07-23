import { useEffect, useState, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  /** Optional one-line context under the title. */
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/** Centered dialog on desktop, bottom sheet on mobile. Supports vertical dragging
 *  (drag down to dismiss) and sticky action footers. Rendered via portal into
 *  document.body to guarantee supreme z-index above all navigation bars. */
export function Modal({ open, onClose, title, description, children, footer, className }: ModalProps) {
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef(0)
  const currentDragYRef = useRef(0)

  useEffect(() => {
    if (!open) {
      setDragY(0)
      setIsDragging(false)
      return
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const handlePointerDown = (e: React.PointerEvent) => {
    // Don't drag if clicking buttons or input elements directly
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, textarea, a')) return

    startYRef.current = e.clientY
    currentDragYRef.current = 0
    setIsDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    const deltaY = e.clientY - startYRef.current
    if (deltaY > 0) {
      // Dragging down: 1 to 1 movement
      currentDragYRef.current = deltaY
      setDragY(deltaY)
    } else {
      // Dragging up: elastic resistance
      const resisted = deltaY * 0.2
      currentDragYRef.current = resisted
      setDragY(resisted)
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return
    setIsDragging(false)
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // Ignore if pointer capture already released
    }

    if (currentDragYRef.current > 110) {
      onClose()
      setTimeout(() => setDragY(0), 200)
    } else {
      setDragY(0)
    }
  }

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className={cn(
          'card-surface relative flex max-h-[85vh] sm:max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border border-border bg-surface shadow-2xl sm:rounded-[24px]',
          !isDragging && 'animate-slide-up sm:animate-pop',
          className,
        )}
      >
        {/* Drag handle header area */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full select-none cursor-grab active:cursor-grabbing touch-none shrink-0"
        >
          <div className="pt-3 pb-1">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-border hover:bg-muted-foreground/40 transition-colors" />
          </div>

          {title && (
            <header className="relative shrink-0 border-b border-border bg-surface px-6 pb-4 pt-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="section-head text-[22px] leading-tight text-foreground">{title}</h2>
                  {description && (
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="pressable -mr-1.5 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
            </header>
          )}
        </div>

        {/* Scrollable form body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 overscroll-contain touch-pan-y">
          {children}
        </div>

        {/* Sticky footer for submit/cancel buttons */}
        {footer && (
          <footer className="shrink-0 border-t border-border bg-surface px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}


