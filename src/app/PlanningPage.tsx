import { PageHeader } from '@/components/ui/list'
import { useT } from '@/features/settings/language-context'
import { PlanningSummary } from '@/features/planning/PlanningSummary'
import { BudgetSection } from '@/features/planning/BudgetSection'
import { BillSection } from '@/features/planning/BillSection'
import { GoalSection } from '@/features/planning/GoalSection'

/**
 * Rencana — the planning home. Budgets, Bills and Savings goals live together
 * on one scroll: a glance strip up top, then each pillar as its own section
 * with a "show the shape" empty state. No sub-tabs; everything's in view.
 */
export function PlanningPage() {
  const { t } = useT()

  return (
    <div className="mx-auto max-w-3xl space-y-7 pb-4">
      <PageHeader title={t('nav.planning')} subtitle={t('planning.subtitle')} />
      <PlanningSummary />
      <BudgetSection />
      <BillSection />
      <GoalSection />
    </div>
  )
}
