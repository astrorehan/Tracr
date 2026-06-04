import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={className ?? 'h-5 w-5 animate-spin text-muted-foreground'} />
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-muted/60 text-muted-foreground shadow-inner">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold tracking-tight">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm font-medium text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
