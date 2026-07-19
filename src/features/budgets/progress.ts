import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns'
import type { BudgetPeriod, Transaction, TransactionSplit } from '@/types/db'
import { categoryContributions } from '@/features/transactions/splits'

const WEEK_OPTS = { weekStartsOn: 1 } as const // Monday-based weeks

export const PERIOD_LABEL: Record<BudgetPeriod, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

export interface Bounds {
  start: Date
  end: Date
}

/** Start/end of the period containing `ref`. */
export function periodBounds(period: BudgetPeriod, ref: Date = new Date()): Bounds {
  switch (period) {
    case 'weekly':
      return { start: startOfWeek(ref, WEEK_OPTS), end: endOfWeek(ref, WEEK_OPTS) }
    case 'yearly':
      return { start: startOfYear(ref), end: endOfYear(ref) }
    case 'monthly':
    default:
      return { start: startOfMonth(ref), end: endOfMonth(ref) }
  }
}

/** Bounds of the period immediately before the one containing `ref`. */
export function previousPeriodBounds(period: BudgetPeriod, ref: Date = new Date()): Bounds {
  const prev =
    period === 'weekly' ? subWeeks(ref, 1) : period === 'yearly' ? subYears(ref, 1) : subMonths(ref, 1)
  return periodBounds(period, prev)
}

/**
 * Sum expense transactions in `currency` that fall inside [start, end].
 * `matchCategoryIds` of null means an overall budget (every expense counts).
 * For category budgets, split transactions contribute only their matching parts.
 */
export function spentInPeriod(
  txns: Transaction[],
  matchCategoryIds: Set<string> | null,
  { start, end }: Bounds,
  currency: string,
  splitsByTx: Record<string, TransactionSplit[]> = {},
): number {
  const s = start.getTime()
  const e = end.getTime()
  let sum = 0
  for (const tx of txns) {
    if (tx.type !== 'expense' || tx.currency !== currency) continue
    const t = new Date(tx.occurred_at).getTime()
    if (t < s || t > e) continue
    // Overall budget: the whole amount counts regardless of category/splits.
    if (!matchCategoryIds) {
      sum += tx.amount
      continue
    }
    for (const { categoryId, amount } of categoryContributions(tx, splitsByTx)) {
      if (categoryId && matchCategoryIds.has(categoryId)) sum += amount
    }
  }
  return sum
}

export type BudgetLevel = 'ok' | 'near' | 'over'

export interface BudgetStatus {
  /** Spent in the current period. */
  spent: number
  /** Unused budget carried in from last period (0 unless rollover is on). */
  carry: number
  /** Base amount + carry. */
  limit: number
  remaining: number
  /** Percentage of the (effective) limit used; can exceed 100. */
  pct: number
  level: BudgetLevel
  /** Linear projection of end-of-period spend from elapsed time. */
  projected: number
  /** How far through the period `ref` sits, 0..1 — "on pace" would be pct === paceFrac*100. */
  paceFrac: number
}

const NEAR_THRESHOLD = 80

/** Combine a base amount, period spend and optional rollover carry into a status. */
export function budgetStatus(
  amount: number,
  spent: number,
  bounds: Bounds,
  carry = 0,
  ref: Date = new Date(),
): BudgetStatus {
  const limit = amount + carry
  const remaining = limit - spent
  const pct = limit > 0 ? (spent / limit) * 100 : spent > 0 ? 100 : 0
  const level: BudgetLevel = pct >= 100 ? 'over' : pct >= NEAR_THRESHOLD ? 'near' : 'ok'

  const totalMs = bounds.end.getTime() - bounds.start.getTime()
  const elapsed = Math.min(Math.max(ref.getTime() - bounds.start.getTime(), 0), totalMs)
  const frac = totalMs > 0 ? elapsed / totalMs : 1
  const projected = frac > 0 ? Math.round(spent / frac) : spent

  return { spent, carry, limit, remaining, pct, level, projected, paceFrac: frac }
}
