import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PiggyBank, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatMoney } from '@/lib/money'
import { useT } from '@/features/settings/language-context'
import { useGoals, useGoalContributions } from './api'
import { goalHealth, type GoalHealth } from './progress'
import type { SavingsGoal } from '@/types/db'

/** Goals shown before the rest wait for a tap through to the full page. */
const MAX_FEATURED = 2

/**
 * Goals on the home screen, not just the Goals page: progress toward what the
 * money is *for*, plus — when this month left something over — a one-tap
 * suggestion of where to put it. At-risk goals (pace won't hit the target
 * date) surface first so the nudge lands before the deadline does, not after.
 */
export function GoalsPreviewCard({ monthNet, base }: { monthNet: number; base: string }) {
  const { t } = useT()
  const { data: goals = [] } = useGoals()
  const { data: contribByGoal = {} } = useGoalContributions()

  const featured = useMemo(() => {
    const withHealth = goals
      .filter((g) => !g.is_archived)
      .map((g) => ({
        goal: g,
        health: goalHealth(g.target_amount, g.target_date, contribByGoal[g.id] ?? []),
      }))
      .filter((x) => !x.health.progress.complete)

    withHealth.sort((a, b) => {
      if (a.health.atRisk !== b.health.atRisk) return a.health.atRisk ? -1 : 1
      return b.health.progress.pct - a.health.progress.pct
    })
    return withHealth.slice(0, MAX_FEATURED)
  }, [goals, contribByGoal])

  if (featured.length === 0) return null

  // Only ever suggested once, against the most urgent goal — and only in the
  // goal's own currency, since target amounts don't carry an FX rate to
  // convert a suggestion safely.
  const top = featured[0]
  const suggestion =
    monthNet > 0 && top.goal.currency === base ? Math.min(monthNet, top.health.progress.remaining) : null

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-base font-bold text-foreground">
          <PiggyBank className="h-[18px] w-[18px] text-muted-foreground" />
          {t('goals.title')}
        </h2>
        <Link to="/goals" className="text-sm font-semibold text-primary transition hover:underline">
          {t('dash.seeAll')}
        </Link>
      </div>

      <div className="mt-3.5 space-y-3.5">
        {featured.map(({ goal, health }) => (
          <GoalRow key={goal.id} goal={goal} health={health} base={base} />
        ))}
      </div>

      {suggestion != null && suggestion > 0 && (
        <Link
          to="/goals"
          className="pressable mt-3.5 flex items-center gap-2.5 rounded-2xl bg-primary-soft px-4 py-3 text-sm font-bold text-primary transition hover:brightness-[0.98]"
        >
          <TrendingUp className="h-[18px] w-[18px] shrink-0" />
          {t('goals.suggestion', { amount: formatMoney(suggestion, base, { signDisplay: 'never' }), name: top.goal.name })}
        </Link>
      )}
    </Card>
  )
}

function GoalRow({ goal, health, base }: { goal: SavingsGoal; health: GoalHealth; base: string }) {
  const { t } = useT()
  const money = (v: number) => formatMoney(v, base, { signDisplay: 'never' })
  const accent = goal.color ?? 'var(--primary)'

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-bold text-foreground">
          <span className="truncate">{goal.name}</span>
          {health.atRisk && (
            <span className="shrink-0 rounded-md bg-warning/12 px-1.5 py-0.5 text-[10px] font-bold uppercase text-warning">
              {t('goals.atRisk')}
            </span>
          )}
        </p>
        <span className="shrink-0 font-numeric text-xs font-bold text-muted-foreground">
          {Math.round(health.progress.pct)}%
        </span>
      </div>

      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${health.progress.pct}%`, backgroundColor: accent }}
        />
      </div>

      <p className="mt-1 text-xs font-medium text-muted-foreground">
        {health.atRisk && health.neededMonthlyRate != null
          ? t('goals.needRate', { amount: money(health.neededMonthlyRate) })
          : t('goals.remaining', { amount: money(health.progress.remaining) })}
      </p>
    </div>
  )
}
