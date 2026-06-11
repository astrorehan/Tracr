import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={className ?? 'h-5 w-5 animate-spin text-muted-foreground'} />
}

/** Shimmering placeholder block — size and round it with className. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-xl', className)} aria-hidden />
}

export function CenterSpinner() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center">
      <Spinner className="h-6 w-6 animate-spin text-primary" />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      {icon && <div className="mb-3 text-muted-foreground/60">{icon}</div>}
      <h3 className="section-head text-xl text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
