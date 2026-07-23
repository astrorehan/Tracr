import { useMemo } from 'react'
import { PiggyBank, Receipt, Target } from 'lucide-react'
import { IconChip } from '@/components/ui/list'
import { useT } from '@/features/settings/language-context'
import { useBudgetStatuses } from '@/features/budgets/useBudgetStatuses'
import { useRecurring } from '@/features/recurring/api'
import { useGoals, useGoalContributions } from '@/features/goals/api'
import { goalProgress } from '@/features/goals/progress'
import { dueInfo } from '@/features/recurring/schedule'
import { cn } from '@/lib/utils'

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * The glance strip at the top of Rencana: one tile per pillar with a live count
 * and a one-word health read, each tapping down to its section. Hides itself
 * entirely until there's something to summarise.
 */
export function PlanningSummary() {
  const { t } = useT()
  const { items } = useBudgetStatuses()
  const { data: recurring = [] } = useRecurring()
  const { data: goals = [] } = useGoals()
  const { data: contribByGoal = {} } = useGoalContributions()

  const budget = useMemo(() => {
    const attention = items.filter((i) => i.status.level === 'over' || i.status.level === 'near').length
    return {
      count: items.length,
      status: attention > 0 ? t('planning.sum.atLimit', { n: attention }) : t('planning.sum.onTrack'),
      tone: attention > 0 ? 'text-warning' : 'text-positive',
    }
  }, [items, t])

  const bill = useMemo(() => {
    const today = new Date()
    const active = recurring.filter((r) => r.is_active)
    const attention = active.filter((r) => {
      const s = dueInfo(r.next_due, today).status
      return s === 'overdue' || s === 'due_soon'
    }).length
    return {
      count: active.length,
      status: attention > 0 ? t('planning.sum.dueSoon', { n: attention }) : t('planning.sum.allClear'),
      tone: attention > 0 ? 'text-warning' : 'text-positive',
    }
  }, [recurring, t])

  const goal = useMemo(() => {
    const active = goals.filter((g) => !g.is_archived)
    const reached = active.filter((g) => goalProgress(g.target_amount, contribByGoal[g.id] ?? []).complete).length
    return {
      count: active.length,
      status: reached > 0 ? t('planning.sum.reached', { n: reached }) : t('planning.sum.saving'),
      tone: reached > 0 ? 'text-positive' : 'text-muted-foreground',
    }
  }, [goals, contribByGoal, t])

  // Nothing planned yet anywhere — let the section ghost states carry the page.
  if (budget.count === 0 && bill.count === 0 && goal.count === 0) return null

  const tiles = [
    { id: 'anggaran', icon: Target, color: 'orange', label: t('nav.budgets'), ...budget },
    { id: 'tagihan', icon: Receipt, color: 'blue', label: t('nav.bills'), ...bill },
    { id: 'nabung', icon: PiggyBank, color: 'violet', label: t('nav.goals'), ...goal },
  ]

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {tiles.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => scrollToSection(t.id)}
          className="card-surface card-hover group rounded-[18px] p-3 text-left sm:p-4"
        >
          <IconChip icon={t.icon} color={t.color} className="h-8 w-8 sm:h-9 sm:w-9" />
          <p className="font-numeric mt-2.5 text-2xl font-extrabold leading-none text-foreground sm:text-[28px]">
            {t.count}
          </p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">{t.label}</p>
          <p className={cn('mt-1.5 truncate text-[11px] font-bold sm:text-xs', t.tone)}>{t.status}</p>
        </button>
      ))}
    </div>
  )
}
