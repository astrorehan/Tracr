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

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="w-full space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 rounded-[20px] border border-border bg-surface p-4 shadow-sm"
        >
          <div className="flex min-w-0 items-center gap-3.5">
            <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-3 w-20 rounded-md" />
            </div>
          </div>
          <div className="flex flex-col items-end space-y-1.5">
            <Skeleton className="h-4 w-24 rounded-md" />
            <Skeleton className="h-3 w-14 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-[24px] border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <Skeleton className="h-10 w-10 rounded-2xl" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="mt-2 space-y-2">
            <Skeleton className="h-3 w-24 rounded-md" />
            <Skeleton className="h-7 w-36 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-48 rounded-xl" />
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>
      <Skeleton className="h-48 w-full rounded-[24px]" />
      <ListSkeleton rows={4} />
    </div>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="w-full space-y-4 rounded-[24px] border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between border-b border-border/50 py-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-2xl lg:max-w-none lg:px-8" aria-busy="true">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-8">
        {/* Primary column skeleton */}
        <div className="min-w-0">
          <Skeleton className="h-52 rounded-none sm:mt-6 sm:h-44 sm:rounded-[24px]" />
          <div className="-mt-5 space-y-5 rounded-t-[26px] bg-background px-4 pb-2 pt-5 sm:mt-6 sm:rounded-none sm:bg-transparent sm:px-0 sm:pt-0">
            <Skeleton className="h-44 rounded-[20px]" /> {/* today's allowance */}
            <Skeleton className="h-[72px] rounded-[20px]" /> {/* needs attention */}
            <div className="grid grid-cols-4 gap-x-1 gap-y-4 rounded-[20px] border border-border bg-surface p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2 py-1">
                  <Skeleton className="h-13 w-13 rounded-2xl" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
            {/* money in / money out */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-56 rounded-[20px]" />
              <Skeleton className="h-56 rounded-[20px]" />
            </div>
            <Skeleton className="h-12 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-64 rounded-[20px]" /> {/* assistant */}
            </div>
          </div>
        </div>
        {/* Right rail skeleton on desktop */}
        <div className="hidden lg:block space-y-5 lg:mt-6">
          <Skeleton className="h-64 rounded-[20px]" /> {/* accounts card */}
          <Skeleton className="h-80 rounded-[20px]" /> {/* activity summary card */}
        </div>
      </div>
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 py-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44 rounded-xl" />
          <Skeleton className="h-4 w-64 rounded-md" />
        </div>
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>
      <CardSkeleton cards={3} />
      <ListSkeleton rows={4} />
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
    <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-border px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          {icon}
        </div>
      )}
      <h3 className="text-xl font-bold text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
