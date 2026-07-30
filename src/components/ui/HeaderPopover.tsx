import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { lockBodyScroll } from '@/lib/scrollLock'
import { useMediaQuery } from '@/lib/useMediaQuery'

interface HeaderPopoverProps {
  open: boolean
  onClose: () => void
  /** Sheet title. Also labels the dialog for screen readers. */
  title: string
  /** Optional control drawn in the title row, left of the close button. */
  action?: ReactNode
  /** Accessible name for the sheet's close button (phones only). */
  closeLabel: string
  children: ReactNode
  className?: string
}

/**
 * The surface every header control opens into: a bottom sheet on phones, a
 * panel pinned under the header on desktop.
 *
 * Portalled into `document.body` on purpose. The old notification dropdown was
 * an absolutely positioned child of the home hero, which is `overflow-hidden`
 * — on a phone the panel was clipped away to nothing, so tapping the bell
 * looked like it did nothing at all. Nothing rendered from here can be clipped
 * by an ancestor again.
 */
export function HeaderPopover({
  open,
  onClose,
  title,
  action,
  closeLabel,
  children,
  className,
}: HeaderPopoverProps) {
  // Phones get a sheet that owns the screen, so the page behind it is frozen.
  // Desktop gets a dropdown, which must not freeze anything: locking the body
  // hides the scrollbar and shoves the whole page sideways as the panel opens.
  // It closes on scroll instead, the way a pinned dropdown should.
  const isPhone = useMediaQuery('(max-width: 639.98px)')

  // Callers pass inline arrows, so read `onClose` through a ref: an unstable
  // dependency here would tear the scroll lock down and set it up again on
  // every parent render.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const close = () => closeRef.current()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)

    if (isPhone) {
      const release = lockBodyScroll()
      return () => {
        document.removeEventListener('keydown', onKey)
        release()
      }
    }

    window.addEventListener('scroll', close, { passive: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close)
    }
  }, [open, isPhone])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-start sm:justify-end sm:pr-6 sm:pt-[70px] lg:pr-8 print:hidden">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-black/50 sm:bg-black/20"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'card-surface relative flex max-h-[82vh] w-full animate-slide-up flex-col overflow-hidden rounded-t-[26px] border border-border bg-surface shadow-lg',
          'sm:max-h-[min(78vh,32rem)] sm:w-[21.5rem] sm:animate-pop sm:rounded-[20px]',
          className,
        )}
      >
        {/* Grabber — phones only, where the panel is a sheet. */}
        <div aria-hidden className="shrink-0 pt-2.5 sm:hidden">
          <div className="mx-auto h-1.5 w-11 rounded-full bg-border" />
        </div>

        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-4">
          <h2 className="section-head truncate text-sm text-foreground">{title}</h2>
          <div className="flex shrink-0 items-center gap-1.5">
            {action}
            <button
              type="button"
              onClick={onClose}
              className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-muted-foreground transition-colors hover:text-foreground sm:hidden"
              aria-label={closeLabel}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
