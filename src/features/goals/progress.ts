import { addDays, differenceInCalendarDays, differenceInCalendarMonths, format } from 'date-fns'
import type { GoalContribution } from '@/types/db'

const MS_PER_MONTH = 30.44 // average days per month, for projection only

export interface GoalProgress {
  saved: number
  remaining: number
  /** 0..100, clamped. */
  pct: number
  complete: boolean
  savedThisMonth: number
  /** Average net deposits per month over the contribution span (minor units). */
  monthlyRate: number
  /** Projected completion date from the current pace, or null if unknown/done. */
  etaDate: Date | null
}

export function goalProgress(
  target: number,
  contributions: GoalContribution[],
  now: Date = new Date(),
): GoalProgress {
  let saved = 0
  let savedThisMonth = 0
  let totalDeposited = 0
  let earliest = now.getTime()
  const monthKey = format(now, 'yyyy-MM')

  for (const c of contributions) {
    saved += c.amount
    if (c.amount > 0) {
      totalDeposited += c.amount
      const t = new Date(c.occurred_at).getTime()
      if (t < earliest) earliest = t
    }
    if (format(new Date(c.occurred_at), 'yyyy-MM') === monthKey) savedThisMonth += c.amount
  }

  const remaining = Math.max(0, target - saved)
  const pct = target > 0 ? Math.min(100, Math.max(0, (saved / target) * 100)) : saved > 0 ? 100 : 0
  const complete = target > 0 && saved >= target

  const monthsElapsed = Math.max(1, differenceInCalendarMonths(now, new Date(earliest)) + 1)
  const monthlyRate = totalDeposited > 0 ? totalDeposited / monthsElapsed : 0

  let etaDate: Date | null = null
  if (!complete && monthlyRate > 0 && remaining > 0) {
    const days = (remaining / monthlyRate) * MS_PER_MONTH
    etaDate = addDays(now, Math.ceil(days))
  }

  return { saved, remaining, pct, complete, savedThisMonth, monthlyRate, etaDate }
}

/** Days until the target date (negative = past); null when no target date. */
export function daysToTarget(targetDate: string | null, now: Date = new Date()): number | null {
  if (!targetDate) return null
  return differenceInCalendarDays(new Date(targetDate), now)
}

export interface GoalHealth {
  progress: GoalProgress
  /** Monthly deposit rate needed to land on the target date; null with no target date. */
  neededMonthlyRate: number | null
  /** True when the target date has a deposit pace that won't get there in time. */
  atRisk: boolean
}

/** Tolerance below the required pace before a goal is flagged — avoids
 *  flip-flopping the badge over a rounding-distance shortfall. */
const AT_RISK_TOLERANCE = 0.9

/**
 * Folds a goal's progress and its target date into one verdict: is the
 * current deposit pace actually going to land on time, and if not, what pace
 * would? A goal with no target date is never "at risk" — there's nothing to
 * be late against.
 */
export function goalHealth(
  target: number,
  targetDate: string | null,
  contributions: GoalContribution[],
  now: Date = new Date(),
): GoalHealth {
  const progress = goalProgress(target, contributions, now)
  if (progress.complete || !targetDate) {
    return { progress, neededMonthlyRate: null, atRisk: false }
  }

  const days = daysToTarget(targetDate, now)!
  if (days <= 0) {
    // Overdue and still short — the whole remainder is due "this instant".
    return { progress, neededMonthlyRate: progress.remaining, atRisk: true }
  }

  const monthsLeft = days / MS_PER_MONTH
  const neededMonthlyRate = progress.remaining / monthsLeft
  return {
    progress,
    neededMonthlyRate,
    atRisk: progress.monthlyRate < neededMonthlyRate * AT_RISK_TOLERANCE,
  }
}
