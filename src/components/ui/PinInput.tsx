import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface PinInputProps {
  length?: number
  value: string
  onChange: (val: string) => void
  disabled?: boolean
  autoFocus?: boolean
}

export function PinInput({
  length = 6,
  value,
  onChange,
  disabled,
  autoFocus = false,
}: PinInputProps) {
  const hiddenInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus && hiddenInputRef.current) {
      hiddenInputRef.current.focus()
    }
  }, [autoFocus])

  const digits = value.split('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, length)
    onChange(raw)
  }

  const handleBoxClick = () => {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.focus()
    }
  }

  return (
    <div className="relative w-full">
      {/* Hidden input capturing input, paste, and touch */}
      <input
        ref={hiddenInputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={length}
        autoComplete="one-time-code"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="absolute inset-0 h-full w-full opacity-0 cursor-pointer z-10"
        aria-label="PIN Input"
      />

      {/* Modern OTP digit boxes grid */}
      <div className="flex items-center justify-between gap-2">
        {Array.from({ length }).map((_, i) => {
          const digit = digits[i]
          const isCurrentFocus =
            value.length === i || (value.length === length && i === length - 1)

          return (
            <div
              key={i}
              onClick={handleBoxClick}
              className={cn(
                'relative flex h-13 w-10 sm:h-14 sm:w-12 items-center justify-center rounded-2xl border-2 text-lg sm:text-xl font-extrabold transition-all duration-200 ease-out select-none',
                digit
                  ? 'border-primary bg-primary/10 text-primary shadow-sm scale-100'
                  : isCurrentFocus
                    ? 'border-primary ring-4 ring-primary/15 bg-surface scale-105 shadow-md'
                    : 'border-border/80 bg-surface-muted/40 text-muted-foreground hover:border-border',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {digit ? (
                <span className="animate-pop text-primary text-xl">●</span>
              ) : (
                isCurrentFocus && (
                  <span className="h-2 w-0.5 animate-pulse rounded-full bg-primary" />
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

