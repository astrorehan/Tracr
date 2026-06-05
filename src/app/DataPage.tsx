import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { DataCard } from '@/features/data/DataCard'

export function DataPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3 py-1">
        <Link
          to="/settings"
          className="rounded-xl border border-transparent p-2 text-muted-foreground transition-all hover:border-border hover:bg-surface-muted hover:text-foreground"
          aria-label="Back to settings"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Data &amp; backup</h1>
          <p className="mt-0.5 text-sm font-medium text-muted-foreground">
            Import, export, and back up everything you own.
          </p>
        </div>
      </div>

      <DataCard />
    </div>
  )
}
