import { Link } from 'react-router-dom'
import { CalendarDays, Sparkles, Target } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { formatMoney } from '@/lib/money'
import { useT } from '@/features/settings/language-context'
import { cn } from '@/lib/utils'
import type { DailyAllowance } from './health'

/** Which story the card is telling. */
type Mood = 'ok' | 'spent' | 'over' | 'tight'

/**
 * "What can I spend today?" — the one number that turns a ledger into a guide.
 *
 * Deliberately never scolds: going over shows amber (not red), leads with what
 * happens next rather than what went wrong, and always names the way back. The
 * progress bar fills rather than drains, so recording a spend feels like
 * progress instead of loss.
 *
 * When spendable cash is far under the usual daily pace the card stops quoting
 * a daily figure at all — a "safe to spend Rp 1,082/day" next to a Rp 54,000/day
 * habit reads as a broken app, not as advice.
 */
export function TodayCard({ allowance, base }: { allowance: DailyAllowance; base: string }) {
  const { t } = useT()
  const { perDay, spentToday, leftToday, available, daysLeft, avgPerDay, basis, tight } = allowance

  const mood: Mood = tight ? 'tight' : available < 0 ? 'over' : leftToday <= 0 ? 'spent' : 'ok'
  const money = (v: number) => formatMoney(v, base, { signDisplay: 'never' })
  // Guard the divide: perDay is 0 once the month's money is gone.
  const usedPct = perDay > 0 ? Math.min(100, (spentToday / perDay) * 100) : spentToday > 0 ? 100 : 0

  const tone = {
    ok: { fill: 'bg-primary', text: 'text-foreground', chip: 'bg-primary-soft text-primary' },
    spent: { fill: 'bg-warning', text: 'text-warning', chip: 'bg-warning/12 text-warning' },
    over: { fill: 'bg-warning', text: 'text-warning', chip: 'bg-warning/12 text-warning' },
    tight: { fill: 'bg-warning', text: 'text-warning', chip: 'bg-warning/12 text-warning' },
  }[mood]

  const headline = { ok: 'today.title', spent: 'today.title', over: 'today.overTitle', tight: 'today.tightTitle' } as const
  // In the tight state the headline number is the cash itself, not a daily slice.
  const bigNumber = mood === 'tight' ? available : mood === 'over' ? Math.abs(available) : Math.max(0, leftToday)

  return (
    <Card className="animate-rise p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            {t(headline[mood])}
          </p>

          <p className={cn('mt-1.5 font-numeric text-[30px] font-extrabold leading-none tracking-tight', tone.text)}>
            <AnimatedNumber value={bigNumber} format={money} />
          </p>

          <p className="mt-2 text-xs font-medium leading-relaxed text-muted-foreground">
            {mood === 'tight'
              ? t('today.tightBody', { avg: money(avgPerDay) })
              : mood === 'over'
                ? t('today.overBody')
                : mood === 'spent'
                  ? t('today.spentBody', { amount: money(Math.abs(leftToday)) })
                  : t('today.ofDaily', { amount: money(perDay) })}
          </p>
        </div>

        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold', tone.chip)}>
          {t('today.daysLeft', { n: daysLeft })}
        </span>
      </div>

      {/* Today's spend filling up today's share. Meaningless once the daily
          figure is no longer the story, so the tight state drops it. */}
      {mood !== 'tight' && (
        <>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-muted" role="presentation">
            <div
              className={cn('h-full rounded-full transition-[width] duration-500 ease-out', tone.fill)}
              style={{ width: `${usedPct}%` }}
            />
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-3 text-xs font-medium">
            <span className="text-muted-foreground">
              {spentToday > 0 ? t('today.spentToday', { amount: money(spentToday) }) : t('today.nothingYet')}
            </span>
            {avgPerDay > 0 && (
              <span className="shrink-0 text-muted-foreground">
                {t('today.usually', { amount: money(avgPerDay) })}
              </span>
            )}
          </div>
        </>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {mood === 'tight'
              ? t('today.tightFooter', { amount: money(spentToday) })
              : available >= 0
                ? t('today.leftForDays', { amount: money(available), n: daysLeft })
                : t('today.overByMonth', { amount: money(Math.abs(available)) })}
          </span>
        </p>
        {basis === 'cash' && (
          <Link
            to={mood === 'tight' ? '/accounts' : '/budgets'}
            className="pressable flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary"
          >
            <Target className="h-3.5 w-3.5" />
            {t(mood === 'tight' ? 'today.moveMoney' : 'today.setBudget')}
          </Link>
        )}
      </div>

      {basis === 'cash' && (
        <p className="mt-2 text-[11px] font-medium leading-relaxed text-muted-foreground">
          {t(mood === 'tight' ? 'today.tightNote' : 'today.cashBasis')}
        </p>
      )}
    </Card>
  )
}
