import { PageHeader } from '@/components/ui/list'
import { DataCard } from '@/features/data/DataCard'

export function DataPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Data & backup" subtitle="Import, export, and back up everything you own." />
      <DataCard />
    </div>
  )
}
