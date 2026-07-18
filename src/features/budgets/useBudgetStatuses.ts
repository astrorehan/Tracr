import { useMemo } from 'react'
import { format } from 'date-fns'
import { indexById } from '@/lib/collections'
import { useBudgets } from './api'
import { useCategories } from '@/features/categories/api'
import { useTransactions } from '@/features/transactions/api'
import { useTransactionSplits } from '@/features/transactions/splits'
import { budgetStatus, periodBounds, previousPeriodBounds, spentInPeriod } from './progress'
import type { BudgetStatus } from './progress'
import type { Budget } from '@/types/db'

/** A budget resolved against the current period: how much is spent, and by what name. */
export interface BudgetStatusItem {
  budget: Budget
  status: BudgetStatus
  /** The category's name, or null for an "all spending" budget — callers translate that. */
  name: string | null
  /** Stable key for the current period (its start date) so alerts reset each period. */
  periodKey: string
}

/**
 * Every budget scored against the period it's in. Shared by the notification
 * bell and the home screen's health card so the two can never disagree about
 * whether a budget is blown; category budgets roll their children up and
 * rollover budgets carry last period's leftovers in.
 */
export function useBudgetStatuses(now: Date = new Date()) {
  const { data: budgets = [], isLoading: lb } = useBudgets()
  const { data: categories = [] } = useCategories()

  // Pull enough history to value the current (and previous, for rollover) period.
  const fromIso = useMemo(() => {
    if (!budgets.length) return undefined
    let earliest = Infinity
    for (const b of budgets) {
      const start = (b.rollover ? previousPeriodBounds(b.period) : periodBounds(b.period)).start.getTime()
      if (start < earliest) earliest = start
    }
    return new Date(earliest).toISOString()
  }, [budgets])

  const { data: transactions = [], isLoading: lt } = useTransactions({ from: fromIso, limit: 5000 })
  const { data: splitsByTx = {} } = useTransactionSplits()

  const items = useMemo(() => {
    const categoryMap = indexById(categories)
    const childIdsByParent = new Map<string, string[]>()
    for (const c of categories) {
      if (!c.parent_id) continue
      const arr = childIdsByParent.get(c.parent_id) ?? []
      arr.push(c.id)
      childIdsByParent.set(c.parent_id, arr)
    }

    return budgets.map((b): BudgetStatusItem => {
      const bounds = periodBounds(b.period, now)
      const matchIds = b.category_id
        ? new Set([b.category_id, ...(childIdsByParent.get(b.category_id) ?? [])])
        : null
      const spent = spentInPeriod(transactions, matchIds, bounds, b.currency, splitsByTx)
      let carry = 0
      if (b.rollover) {
        const prevSpent = spentInPeriod(
          transactions,
          matchIds,
          previousPeriodBounds(b.period, now),
          b.currency,
          splitsByTx,
        )
        carry = Math.max(0, b.amount - prevSpent)
      }
      const status = budgetStatus(b.amount, spent, bounds, carry, now)
      const name = b.category_id ? (categoryMap[b.category_id]?.name ?? null) : null
      return { budget: b, status, name, periodKey: format(bounds.start, 'yyyy-MM-dd') }
    })
    // `now` is intentionally excluded: it ticks every render and the period it
    // resolves to only changes at a boundary, which a data refetch will pick up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, categories, transactions, splitsByTx])

  return { items, isLoading: lb || lt }
}

/** The single "all spending" budget for the month, if the user set one. */
export function overallMonthlyBudget(items: BudgetStatusItem[]): BudgetStatusItem | undefined {
  return items.find((i) => i.budget.category_id === null && i.budget.period === 'monthly')
}
