import { PageHeader } from '@/components/ui/list'
import { useT } from '@/features/settings/language-context'
import { DataCard } from '@/features/data/DataCard'

export function DataPage() {
  const { t } = useT()
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title={t('data.title')} subtitle={t('data.subtitle')} />
      <DataCard />
    </div>
  )
}
