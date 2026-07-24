import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Small circled chevron + label, sitting above a page title. Used by any page
 *  reached from somewhere else (Accounts, the Buku Usaha tools). */
export function BackLink({
  to,
  label,
  className,
}: {
  to: string
  label: string
  className?: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex w-max items-center gap-2 text-muted-foreground transition-colors hover:text-foreground',
        className,
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface">
        <ChevronLeft className="h-4 w-4" />
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  )
}
