import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DropdownOption<T extends string> {
  value: T
  label: string
}

interface DropdownProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: DropdownOption<T>[]
  className?: string
  /** Menu edge to align with the trigger. */
  align?: 'start' | 'end'
  'aria-label'?: string
}

/** A styled select: a field-shaped trigger plus a popover menu that matches the
 *  card system, so the open list reads as the app rather than the OS chrome.
 *  Closes on Escape or outside click. */
export function Dropdown<T extends string>({
  value,
  onChange,
  options,
  className,
  align = 'start',
  'aria-label': ariaLabel,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="pressable flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
      >
        <span className="truncate">{current?.label ?? 'Select…'}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            'card-surface absolute z-50 mt-2 max-h-72 min-w-full overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-lg animate-fade-in',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {options.map((opt) => {
            const selected = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                  selected
                    ? 'bg-primary-soft font-semibold text-primary'
                    : 'font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground',
                )}
              >
                <span className="truncate">{opt.label}</span>
                {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
