import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-foreground btn-sheen hover:brightness-[1.06] active:brightness-95 active:scale-[0.98]',
  secondary:
    'bg-surface-muted text-foreground border border-border hover:bg-border/50 active:scale-[0.98]',
  ghost: 'bg-transparent text-foreground hover:bg-surface-muted active:scale-[0.98]',
  danger: 'bg-danger text-white btn-sheen hover:brightness-[1.06] active:scale-[0.98]',
  outline: 'border border-border bg-transparent text-foreground hover:bg-surface-muted active:scale-[0.98]',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3.5 text-xs font-semibold rounded-lg',
  md: 'h-11 px-5 text-sm font-semibold rounded-xl',
  lg: 'h-12 px-6 text-base font-semibold rounded-xl',
  icon: 'h-11 w-11 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
})
