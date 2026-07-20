import { Link } from 'react-router-dom'
import { Gauge } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatMoney } from '@/lib/money'
import { useT } from '@/features/settings/language-context'
import { cn } from '@/lib/utils'
import { featuredBudget, type BudgetStatusItem } from './useBudgetStatuses'

/** Below this, "you're X% over pace" is just noise from being a day into the period. */
const MIN_PACE_FRAC = 0.03

const LEVEL_FILL: Record<BudgetStatusItem['status']['level'], string> = {
  ok: 'bg-primary',
  near: 'bg-warning',
  over: 'bg-danger',
}

/**
 * Not just "how much is spent" (the flow cards already show that) but "is that
 * on pace" — a tick mark on the bar showing where spend *should* be if it were
 * even across the period, so 60% spent reads differently on day 10 than on
 * day 25. Featureless until a budget exists; the empty state is the flow
 * cards' job, not this one's.
 */
export function BudgetPaceCard({ items, base }: { items: BudgetStatusItem[]; base: string }) {
  const { t } = useT()
  const featured = featuredBudget(items)
  if (!featured) return null

  const { status, name } = featured
  const money = (v: number) => formatMoney(v, base, { signDisplay: 'never' })
  const pacePct = status.paceFrac * 100
  const actualPct = Math.min(100, status.pct)
  const paceDelta = Math.round(status.pct - pacePct)
  const showPaceDelta = status.paceFrac >= MIN_PACE_FRAC

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <Gauge className="h-4 w-4" />
          {name ?? t('budgets.overallLabel')}
        </p>
        <Link to="/budgets" className="shrink-0 text-xs font-semibold text-primary transition hover:underline">
          {t('dash.seeAll')}
        </Link>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-numeric text-[22px] font-extrabold leading-none tracking-tight text-foreground">
          {Math.round(status.pct)}%
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {t('budgets.spentOfLimit', { spent: money(status.spent), limit: money(status.limit) })}
        </span>
      </div>

      <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 ease-out', LEVEL_FILL[status.level])}
          style={{ width: `${actualPct}%` }}
        />
        {/* Pace marker: where spend would sit if it were even across the period. */}
        <div
          className="absolute top-0 h-full w-0.5 bg-foreground/50"
          style={{ left: `${Math.min(100, pacePct)}%` }}
          aria-hidden
        />
      </div>

      <p className="mt-2.5 text-xs font-semibold">
        {!showPaceDelta ? (
          <span className="font-medium text-muted-foreground">{t('budgets.justStarted')}</span>
        ) : paceDelta <= 0 ? (
          <span className="text-positive">{t('budgets.underPace', { pct: Math.abs(paceDelta) })}</span>
        ) : (
          <span className={status.level === 'over' ? 'text-danger' : 'text-warning'}>
            {t('budgets.overPace', { pct: paceDelta })}
          </span>
        )}
      </p>
    </Card>
  )
}
