import { useCallback, useMemo, useState } from 'react'
import { useRecurring } from '@/features/recurring/api'
import { useBudgetStatuses } from '@/features/budgets/useBudgetStatuses'
import { billNotifications, budgetNotifications, sortNotifications, type AppNotification } from './notifications'

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
 * localStorage. Budget spend comes from the shared hook the Budgets page and
 * the home health card also read, so the three can't disagree.
 */
export function useNotifications() {
  const { data: recurring = [] } = useRecurring()
  const { items: budgetItems } = useBudgetStatuses()

  const [reads, setReads] = useState<Set<string>>(loadReads)

  const notifications = useMemo(
    () => sortNotifications([...billNotifications(recurring), ...budgetNotifications(budgetItems)]),
    [recurring, budgetItems],
  )

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
