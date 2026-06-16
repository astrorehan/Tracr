import { useCallback, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { indexById } from '@/lib/collections'
import { useRecurring } from '@/features/recurring/api'
import { useBudgets } from '@/features/budgets/api'
import { useCategories } from '@/features/categories/api'
import { useTransactions } from '@/features/transactions/api'
import { useTransactionSplits } from '@/features/transactions/splits'
import {
  budgetStatus,
  periodBounds,
  previousPeriodBounds,
  spentInPeriod,
} from '@/features/budgets/progress'
import {
  billNotifications,
  budgetNotifications,
  sortNotifications,
  type AppNotification,
  type BudgetAlertInput,
} from './notifications'

const READS_KEY = 'tracr.notifications.read.v1'

function loadReads(): Set<string> {
  try {
    const raw = localStorage.getItem(READS_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function persistReads(set: Set<string>) {
  try {
    localStorage.setItem(READS_KEY, JSON.stringify([...set]))
  } catch {
    // storage unavailable (private mode) — read-state just won't persist
  }
}

export interface ResolvedNotification extends AppNotification {
  read: boolean
}

/**
 * Derives the in-app notification list (overdue/due-soon bills, near/over
 * budgets) from already-cached data and tracks per-id read-state in
 * localStorage. Budget spend is computed exactly as the Budgets page does.
 */
export function useNotifications() {
  const { data: recurring = [] } = useRecurring()
  const { data: budgets = [] } = useBudgets()
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

  const { data: transactions = [] } = useTransactions({ from: fromIso, limit: 5000 })
  const { data: splitsByTx = {} } = useTransactionSplits()

  const [reads, setReads] = useState<Set<string>>(loadReads)

  const notifications = useMemo(() => {
    const now = new Date()
    const bills = billNotifications(recurring, now)

    const categoryMap = indexById(categories)
    const childIdsByParent = new Map<string, string[]>()
    for (const c of categories) {
      if (!c.parent_id) continue
      const arr = childIdsByParent.get(c.parent_id) ?? []
      arr.push(c.id)
      childIdsByParent.set(c.parent_id, arr)
    }

    const budgetItems: BudgetAlertInput[] = budgets.map((b) => {
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
      const name = b.category_id ? (categoryMap[b.category_id]?.name ?? 'Category') : 'Overall spending'
      return { budget: b, status, name, periodKey: format(bounds.start, 'yyyy-MM-dd') }
    })

    return sortNotifications([...bills, ...budgetNotifications(budgetItems)])
  }, [recurring, budgets, categories, transactions, splitsByTx])

  const resolved: ResolvedNotification[] = useMemo(
    () => notifications.map((n) => ({ ...n, read: reads.has(n.id) })),
    [notifications, reads],
  )
  const unreadCount = resolved.reduce((n, x) => (x.read ? n : n + 1), 0)

  const markRead = useCallback((id: string) => {
    setReads((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev).add(id)
      persistReads(next)
      return next
    })
  }, [])

  const markAllRead = useCallback(() => {
    setReads((prev) => {
      const next = new Set(prev)
      for (const n of notifications) next.add(n.id)
      persistReads(next)
      return next
    })
  }, [notifications])

  return { notifications: resolved, unreadCount, markRead, markAllRead }
}
