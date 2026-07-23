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
    <div className="space-y-7 pb-4">
      <PageHeader title={t('nav.planning')} subtitle={t('planning.subtitle')} />
      <PlanningSummary />
      {/* Full-width: on wide screens the three sections flow into two balanced
          columns so cards stay a comfortable width instead of stretching edge
          to edge. Each section is kept whole (never split across columns). */}
      <div className="space-y-6 lg:columns-2 lg:gap-6 lg:space-y-0 lg:[&>section]:mb-6 lg:[&>section]:break-inside-avoid">
        <BudgetSection />
        <BillSection />
        <GoalSection />
      </div>
    </div>
  )
}
