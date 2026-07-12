import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type IconType = ComponentType<{ className?: string }>

/** Named chip accents (the only place color lives) + a couple of semantic ones. */
const CHIP: Record<string, string> = {
  blue: 'bg-chip-blue-bg text-chip-blue-fg',
  green: 'bg-chip-green-bg text-chip-green-fg',
  orange: 'bg-chip-orange-bg text-chip-orange-fg',
  violet: 'bg-chip-violet-bg text-chip-violet-fg',
  slate: 'bg-surface-muted text-muted-foreground',
  red: 'bg-danger/10 text-danger',
  primary: 'bg-primary-soft text-primary',
}

/** Big page title + optional subtitle and a right-aligned action (usually a Pill). */
export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm font-medium text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

/** A titled block: bold section label (+ optional action) over its content. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-1">
          {title ? (
            <h2 className="text-base font-bold text-foreground">{title}</h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Rounded-full action pill (title-bar actions, "Add", "Export", filters). */
export function Pill({
  children,
  icon: Icon,
  trailingIcon: Trailing,
  variant = 'line',
  to,
  onClick,
  className,
  'aria-label': ariaLabel,
}: {
  children: ReactNode
  icon?: IconType
  trailingIcon?: IconType
  variant?: 'line' | 'tint' | 'solid'
  to?: string
  onClick?: () => void
  className?: string
  'aria-label'?: string
}) {
  const cls = cn(
    'pressable inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors',
    variant === 'tint' && 'bg-primary-soft text-primary hover:brightness-[0.97]',
    variant === 'solid' && 'btn-sheen bg-primary text-primary-foreground hover:brightness-[1.06]',
    variant === 'line' && 'border border-border bg-surface text-foreground hover:bg-surface-muted',
    className,
  )
  const inner = (
    <>
      {Icon && <Icon className="h-4 w-4" />}
      {children}
      {Trailing && <Trailing className="h-4 w-4 text-muted-foreground" />}
    </>
  )
  if (to)
    return (
      <Link to={to} className={cls} aria-label={ariaLabel}>
        {inner}
      </Link>
    )
  return (
    <button type="button" onClick={onClick} className={cls} aria-label={ariaLabel}>
      {inner}
    </button>
  )
}

/** Circular leading chip for a row. `color` is a named accent, a hex string
 *  (tinted from that hue), or omit with `plain` for a bare muted icon. */
export function IconChip({
  icon: Icon,
  color,
  plain = false,
  className,
}: {
  icon: IconType
  color?: keyof typeof CHIP | string
  plain?: boolean
  className?: string
}) {
  if (plain) {
    return (
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground', className)}>
        <Icon className="h-[22px] w-[22px]" />
      </span>
    )
  }
  const isHex = typeof color === 'string' && color.startsWith('#')
  return (
    <span
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
        !isHex && CHIP[color ?? 'slate'],
        className,
      )}
      style={isHex ? { backgroundColor: `${color}22`, color: color as string } : undefined}
    >
      <Icon className="h-5 w-5" />
    </span>
  )
}

/** Convenience wrapper: a white card meant to hold a stack of ListRows. */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('card-surface divide-y divide-border rounded-[20px] px-4', className)}>
      {children}
    </div>
  )
}

/** One list row: leading chip/icon + title/subtitle (+ badge) + trailing value or
 *  chevron. Renders as a link, button, or static row depending on props. */
export function ListRow({
  leading,
  title,
  subtitle,
  badge,
  trailing,
  to,
  onClick,
  chevron,
  className,
}: {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  trailing?: ReactNode
  to?: string
  onClick?: () => void
  /** Show a chevron (defaults on when the row is a link/button and has no trailing). */
  chevron?: boolean
  className?: string
}) {
  const interactive = Boolean(to || onClick)
  const showChevron = chevron ?? (interactive && !trailing)
  const content = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-bold text-foreground">{title}</p>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {trailing}
      {showChevron && <ChevronRight className="h-[18px] w-5 shrink-0 text-muted-foreground" />}
    </>
  )
  const cls = cn('flex items-center gap-3 py-3', interactive && 'transition-colors', className)
  if (to)
    return (
      <Link to={to} className={cn(cls, 'hover:opacity-90')}>
        {content}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(cls, 'w-full text-left hover:opacity-90')}>
        {content}
      </button>
    )
  return <div className={cls}>{content}</div>
}

/** A tinted call-to-action row that sits inside a card (GoPay's green promo pill,
 *  in our --primary-soft blue). */
export function CtaRow({
  icon: Icon,
  children,
  to,
  onClick,
  tone = 'primary',
  className,
}: {
  icon?: IconType
  children: ReactNode
  to?: string
  onClick?: () => void
  tone?: 'primary' | 'positive' | 'warning'
  className?: string
}) {
  const toneCls =
    tone === 'positive'
      ? 'bg-positive/10 text-positive'
      : tone === 'warning'
        ? 'bg-warning/10 text-warning'
        : 'bg-primary-soft text-primary'
  const cls = cn(
    'pressable flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-bold transition hover:brightness-[0.98]',
    toneCls,
    className,
  )
  const inner = (
    <>
      {Icon && <Icon className="h-[18px] w-[18px] shrink-0" />}
      <span className="flex-1">{children}</span>
      <ChevronRight className="h-[18px] w-[18px] shrink-0" />
    </>
  )
  if (to)
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    )
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}
