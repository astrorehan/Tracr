import { dueInfo } from '@/features/recurring/schedule'
import { formatMoney } from '@/lib/money'
import type { MsgKey, TVars } from '@/i18n'
import type { BudgetStatusItem } from '@/features/budgets/useBudgetStatuses'
import type { RecurringTransaction } from '@/types/db'

/**
 * In-app notifications are derived purely from the data already on the client —
 * no backend, no storage. Each notification has a *stable* id so its read-state
 * survives refreshes and only resets when the underlying situation changes (a
 * bill's due date advances, a budget rolls into a new period, or it crosses a
 * worse threshold). Web push would later reuse these same builders server-side.
 *
 * Copy is emitted as message keys, not finished sentences, so the bell and the
 * home screen's attention card both read in the user's language.
 */

export type NotificationSeverity = 'warning' | 'danger'

/** Either literal user text (a bill's name) or something to translate. */
export type NoteText = { text: string } | { key: MsgKey; vars?: TVars }

export interface AppNotification {
  id: string
  severity: NotificationSeverity
  title: NoteText
  body: NoteText
  /** Where tapping it takes you. */
  href: string
  /** Higher = more urgent; drives ordering. */
  priority: number
}

/** Resolve a {@link NoteText} against a translator. */
export function noteText(note: NoteText, t: (key: MsgKey, vars?: TVars) => string): string {
  return 'text' in note ? note.text : t(note.key, note.vars)
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
    const amount = formatMoney(rec.amount, rec.currency, { signDisplay: 'never' })
    out.push({
      id: `bill:${rec.id}:${rec.next_due}`,
      severity: overdue ? 'danger' : 'warning',
      title: { text: rec.name },
      body: overdue
        ? { key: 'notif.bill.overdue', vars: { n: Math.abs(days), amount } }
        : days === 0
          ? { key: 'notif.bill.today', vars: { amount } }
          : days === 1
            ? { key: 'notif.bill.tomorrow', vars: { amount } }
            : { key: 'notif.bill.inDays', vars: { n: days, amount } },
      href: '/bills',
      priority: overdue ? 1000 + Math.abs(days) : 500 + (7 - days),
    })
  }
  return out
}

/** Scored budgets come from the shared `useBudgetStatuses` hook. */
export type BudgetAlertInput = BudgetStatusItem

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
      title: name
        ? { key: over ? 'notif.budget.over' : 'notif.budget.near', vars: { name } }
        : { key: over ? 'notif.budget.overAll' : 'notif.budget.nearAll' },
      body: {
        key: 'notif.budget.body',
        vars: {
          spent: formatMoney(status.spent, budget.currency, { signDisplay: 'never' }),
          limit: formatMoney(status.limit, budget.currency, { signDisplay: 'never' }),
          pct,
        },
      },
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
