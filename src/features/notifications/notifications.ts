import { dueInfo, dueText } from '@/features/recurring/schedule'
import { formatMoney } from '@/lib/money'
import type { BudgetStatus } from '@/features/budgets/progress'
import type { Budget, RecurringTransaction } from '@/types/db'

/**
 * In-app notifications are derived purely from the data already on the client —
 * no backend, no storage. Each notification has a *stable* id so its read-state
 * survives refreshes and only resets when the underlying situation changes (a
 * bill's due date advances, a budget rolls into a new period, or it crosses a
 * worse threshold). Web push would later reuse these same builders server-side.
 */

export type NotificationSeverity = 'warning' | 'danger'

export interface AppNotification {
  id: string
  severity: NotificationSeverity
  title: string
  body: string
  /** Where tapping it takes you. */
  href: string
  /** Higher = more urgent; drives ordering. */
  priority: number
}

/** Overdue and due-soon (≤7d) bills become notifications; upcoming ones stay quiet. */
export function billNotifications(
  recurring: RecurringTransaction[],
  today: Date = new Date(),
): AppNotification[] {
  const out: AppNotification[] = []
  for (const rec of recurring) {
    if (!rec.is_active) continue
    const { status, days } = dueInfo(rec.next_due, today)
    if (status === 'upcoming') continue
    const overdue = status === 'overdue'
    out.push({
      id: `bill:${rec.id}:${rec.next_due}`,
      severity: overdue ? 'danger' : 'warning',
      title: rec.name,
      body: `${dueText(rec.next_due, today)} · ${formatMoney(rec.amount, rec.currency, { signDisplay: 'never' })}`,
      href: '/bills',
      priority: overdue ? 1000 + Math.abs(days) : 500 + (7 - days),
    })
  }
  return out
}

export interface BudgetAlertInput {
  budget: Budget
  status: BudgetStatus
  /** Display name (category name, or "Overall spending"). */
  name: string
  /** Stable key for the current period (e.g. its start date) so alerts reset each period. */
  periodKey: string
}

/** Budgets at or over their limit (danger) or nearing it (warning) become notifications. */
export function budgetNotifications(items: BudgetAlertInput[]): AppNotification[] {
  const out: AppNotification[] = []
  for (const { budget, status, name, periodKey } of items) {
    if (status.level === 'ok') continue
    const over = status.level === 'over'
    const pct = Math.round(status.pct)
    out.push({
      id: `budget:${budget.id}:${periodKey}:${status.level}`,
      severity: over ? 'danger' : 'warning',
      title: over ? `${name} budget exceeded` : `${name} budget almost gone`,
      body: `${formatMoney(status.spent, budget.currency, { signDisplay: 'never' })} of ${formatMoney(status.limit, budget.currency, { signDisplay: 'never' })} · ${pct}%`,
      href: '/budgets',
      priority: over ? 900 + (pct - 100) : 400 + (pct - 80),
    })
  }
  return out
}

/** Most-urgent first (overdue bills → over budgets → due-soon bills → near budgets). */
export function sortNotifications(list: AppNotification[]): AppNotification[] {
  return [...list].sort((a, b) => b.priority - a.priority)
}
