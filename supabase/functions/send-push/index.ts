// Web-push sender. Invoked daily by a pg_cron job (see migration 0025). It
// re-runs the in-app notification builders server-side (overdue/due-soon bills,
// near/over budgets) for every user who has at least one push subscription, and
// delivers a Web Push per new alert. A `push_sent` ledger keyed by the alert's
// stable id keeps each one to a single push. Dead subscriptions (404/410) are
// pruned.
//
// Auth: pg_cron sends a shared secret (public.app_secrets → 'push_token') as a
// Bearer token; verify_jwt is disabled because the caller is the cron job.
//
// The bill/budget logic mirrors src/features/notifications + budgets/progress +
// recurring/schedule exactly, so push and in-app alerts agree.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import {
  differenceInCalendarDays,
  parseISO,
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subWeeks,
  subMonths,
  subYears,
} from 'npm:date-fns@4.1.0'

// ---------------------------------------------------------------------------
// Money — mirror of src/lib/currencies.ts decimals + a tolerant formatter.
// ---------------------------------------------------------------------------
const DECIMALS: Record<string, number> = {
  IDR: 0, USD: 2, EUR: 2, SGD: 2, MYR: 2, JPY: 0, GBP: 2, AUD: 2,
  BTC: 8, ETH: 8, USDT: 2,
}
const decimalsOf = (code: string) => DECIMALS[code] ?? 2

function formatMoney(minor: number, currency: string): string {
  const d = decimalsOf(currency)
  const major = minor / 10 ** d
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(major)
  } catch {
    // Non-ISO codes (BTC/ETH/USDT) — Intl currency style rejects them.
    return `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d }).format(major)} ${currency}`
  }
}

// ---------------------------------------------------------------------------
// Notification builders — mirror of src/features/notifications/notifications.ts
// and the schedule/budget helpers they depend on.
// ---------------------------------------------------------------------------
type Period = 'weekly' | 'monthly' | 'yearly'

interface AppNotification {
  id: string
  title: string
  body: string
  href: string
  priority: number
}

interface Recurring {
  id: string
  book_id: string
  name: string
  amount: number
  currency: string
  next_due: string
  is_active: boolean
}

function dueInfo(dueISO: string, today: Date): { status: 'overdue' | 'due_soon' | 'upcoming'; days: number } {
  const days = differenceInCalendarDays(parseISO(dueISO), today)
  if (days < 0) return { status: 'overdue', days }
  if (days <= 7) return { status: 'due_soon', days }
  return { status: 'upcoming', days }
}

function dueText(dueISO: string, today: Date): string {
  const { status, days } = dueInfo(dueISO, today)
  if (status === 'overdue') return `Overdue ${Math.abs(days)}d`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `in ${days}d`
}

function billNotifications(recurring: Recurring[], today: Date): AppNotification[] {
  const out: AppNotification[] = []
  for (const rec of recurring) {
    if (!rec.is_active) continue
    const { status, days } = dueInfo(rec.next_due, today)
    if (status === 'upcoming') continue
    const overdue = status === 'overdue'
    out.push({
      id: `bill:${rec.id}:${rec.next_due}`,
      title: rec.name,
      body: `${dueText(rec.next_due, today)} · ${formatMoney(rec.amount, rec.currency)}`,
      href: '/bills',
      priority: overdue ? 1000 + Math.abs(days) : 500 + (7 - days),
    })
  }
  return out
}

interface Budget {
  id: string
  book_id: string
  category_id: string | null
  period: Period
  amount: number
  currency: string
  rollover: boolean
}
interface Tx {
  id: string
  book_id: string
  type: string
  amount: number
  currency: string
  category_id: string | null
  occurred_at: string
}
interface Split {
  transaction_id: string
  category_id: string | null
  amount: number
}

const WEEK_OPTS = { weekStartsOn: 1 } as const

function periodBounds(period: Period, ref: Date): { start: Date; end: Date } {
  switch (period) {
    case 'weekly':
      return { start: startOfWeek(ref, WEEK_OPTS), end: endOfWeek(ref, WEEK_OPTS) }
    case 'yearly':
      return { start: startOfYear(ref), end: endOfYear(ref) }
    default:
      return { start: startOfMonth(ref), end: endOfMonth(ref) }
  }
}
function previousPeriodBounds(period: Period, ref: Date): { start: Date; end: Date } {
  const prev = period === 'weekly' ? subWeeks(ref, 1) : period === 'yearly' ? subYears(ref, 1) : subMonths(ref, 1)
  return periodBounds(period, prev)
}

function spentInPeriod(
  txns: Tx[],
  matchCategoryIds: Set<string> | null,
  bounds: { start: Date; end: Date },
  currency: string,
  splitsByTx: Record<string, Split[]>,
): number {
  const s = bounds.start.getTime()
  const e = bounds.end.getTime()
  let sum = 0
  for (const tx of txns) {
    if (tx.type !== 'expense' || tx.currency !== currency) continue
    const t = new Date(tx.occurred_at).getTime()
    if (t < s || t > e) continue
    if (!matchCategoryIds) {
      sum += tx.amount
      continue
    }
    const splits = splitsByTx[tx.id]
    const parts = splits && splits.length > 0
      ? splits.map((sp) => ({ categoryId: sp.category_id, amount: sp.amount }))
      : [{ categoryId: tx.category_id, amount: tx.amount }]
    for (const { categoryId, amount } of parts) {
      if (categoryId && matchCategoryIds.has(categoryId)) sum += amount
    }
  }
  return sum
}

const NEAR_THRESHOLD = 80
function budgetLevel(amount: number, spent: number, carry: number): { level: 'ok' | 'near' | 'over'; pct: number; limit: number; spent: number } {
  const limit = amount + carry
  const pct = limit > 0 ? (spent / limit) * 100 : spent > 0 ? 100 : 0
  const level = pct >= 100 ? 'over' : pct >= NEAR_THRESHOLD ? 'near' : 'ok'
  return { level, pct, limit, spent }
}

function budgetNotifications(
  budgets: Budget[],
  txns: Tx[],
  splitsByTx: Record<string, Split[]>,
  categoryName: Map<string, string>,
  childIdsByParent: Map<string, string[]>,
  now: Date,
): AppNotification[] {
  const out: AppNotification[] = []
  for (const b of budgets) {
    const bounds = periodBounds(b.period, now)
    const matchIds = b.category_id
      ? new Set([b.category_id, ...(childIdsByParent.get(b.category_id) ?? [])])
      : null
    const spent = spentInPeriod(txns, matchIds, bounds, b.currency, splitsByTx)
    let carry = 0
    if (b.rollover) {
      const prevSpent = spentInPeriod(txns, matchIds, previousPeriodBounds(b.period, now), b.currency, splitsByTx)
      carry = Math.max(0, b.amount - prevSpent)
    }
    const status = budgetLevel(b.amount, spent, carry)
    if (status.level === 'ok') continue
    const over = status.level === 'over'
    const pct = Math.round(status.pct)
    const name = b.category_id ? (categoryName.get(b.category_id) ?? 'Category') : 'Overall spending'
    const periodKey = format(bounds.start, 'yyyy-MM-dd')
    out.push({
      id: `budget:${b.id}:${periodKey}:${status.level}`,
      title: over ? `${name} budget exceeded` : `${name} budget almost gone`,
      body: `${formatMoney(status.spent, b.currency)} of ${formatMoney(status.limit, b.currency)} · ${pct}%`,
      href: '/budgets',
      priority: over ? 900 + (pct - 100) : 400 + (pct - 80),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const MAX_PER_USER = 10 // cap pushes per user per run (avoid a first-subscribe flood)

interface Subscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // --- authenticate the cron caller against the shared secret ---
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const { data: secrets } = await admin
    .from('app_secrets')
    .select('key, value')
    .in('key', ['push_token', 'vapid_public', 'vapid_private', 'vapid_subject'])
  const secret = new Map((secrets ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
  if (!token || token !== secret.get('push_token')) return json({ error: 'unauthorized' }, 401)

  const vapidPublic = secret.get('vapid_public')
  const vapidPrivate = secret.get('vapid_private')
  const vapidSubject = secret.get('vapid_subject') ?? 'mailto:admin@example.com'
  if (!vapidPublic || !vapidPrivate) return json({ error: 'VAPID keys not configured' }, 500)
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  // --- all subscriptions, grouped by user ---
  const { data: subs, error: subErr } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .returns<Subscription[]>()
  if (subErr) return json({ error: subErr.message }, 500)
  if (!subs || subs.length === 0) return json({ users: 0, sent: 0 })

  const byUser = new Map<string, Subscription[]>()
  for (const s of subs) {
    const arr = byUser.get(s.user_id) ?? []
    arr.push(s)
    byUser.set(s.user_id, arr)
  }

  const now = new Date()
  let sent = 0
  const errors: string[] = []

  for (const [uid, userSubs] of byUser) {
    try {
      // --- the user's books (alerts span all of them; labeled when >1) ---
      const { data: bookRows } = await admin
        .from('books')
        .select('id, name')
        .eq('owner_id', uid)
        .returns<{ id: string; name: string }[]>()
      const bookName = new Map<string, string>()
      for (const b of bookRows ?? []) bookName.set(b.id, b.name)
      const multiBook = bookName.size > 1
      // Prefix an alert with its book name so a user with several ledgers can
      // tell which one fired (single-book users see no prefix).
      const label = (note: AppNotification, bookId: string): AppNotification =>
        multiBook && bookName.has(bookId)
          ? { ...note, title: `${bookName.get(bookId)} · ${note.title}` }
          : note

      // --- bills (all books) ---
      const { data: recurring } = await admin
        .from('recurring_transactions')
        .select('id, book_id, name, amount, currency, next_due, is_active')
        .eq('user_id', uid)
        .eq('is_active', true)
        .returns<Recurring[]>()

      const billAlerts: AppNotification[] = []
      for (const rec of recurring ?? []) {
        for (const note of billNotifications([rec], now)) billAlerts.push(label(note, rec.book_id))
      }

      // --- budgets + the data to value them ---
      const { data: budgets } = await admin
        .from('budgets')
        .select('id, book_id, category_id, period, amount, currency, rollover')
        .eq('user_id', uid)
        .returns<Budget[]>()

      const budgetAlerts: AppNotification[] = []
      if (budgets && budgets.length > 0) {
        // Earliest period start we must value (rollover needs the previous one).
        let earliest = Infinity
        for (const b of budgets) {
          const start = (b.rollover ? previousPeriodBounds(b.period, now) : periodBounds(b.period, now)).start.getTime()
          if (start < earliest) earliest = start
        }
        const fromIso = new Date(earliest).toISOString()

        const { data: txns } = await admin
          .from('transactions')
          .select('id, book_id, type, amount, currency, category_id, occurred_at')
          .eq('user_id', uid)
          .eq('type', 'expense')
          .gte('occurred_at', fromIso)
          .returns<Tx[]>()
        const txList = txns ?? []

        const splitsByTx: Record<string, Split[]> = {}
        if (txList.length > 0) {
          const { data: splits } = await admin
            .from('transaction_splits')
            .select('transaction_id, category_id, amount')
            .eq('user_id', uid)
            .returns<Split[]>()
          for (const sp of splits ?? []) (splitsByTx[sp.transaction_id] ??= []).push(sp)
        }

        const { data: cats } = await admin
          .from('categories')
          .select('id, name, parent_id')
          .eq('user_id', uid)
          .returns<{ id: string; name: string; parent_id: string | null }[]>()
        const categoryName = new Map<string, string>()
        const childIdsByParent = new Map<string, string[]>()
        for (const c of cats ?? []) {
          categoryName.set(c.id, c.name)
          if (!c.parent_id) continue
          const arr = childIdsByParent.get(c.parent_id) ?? []
          arr.push(c.id)
          childIdsByParent.set(c.parent_id, arr)
        }

        // Value each book's budgets against only that book's transactions, so an
        // overall ("all spending") budget never sums another book's expenses.
        const bookIds = new Set<string>(budgets.map((b) => b.book_id))
        for (const bookId of bookIds) {
          const bookBudgets = budgets.filter((b) => b.book_id === bookId)
          const bookTxns = txList.filter((t) => t.book_id === bookId)
          for (const note of budgetNotifications(
            bookBudgets,
            bookTxns,
            splitsByTx,
            categoryName,
            childIdsByParent,
            now,
          )) {
            budgetAlerts.push(label(note, bookId))
          }
        }
      }

      const candidates = [...billAlerts, ...budgetAlerts].sort((a, b) => b.priority - a.priority)
      if (candidates.length === 0) continue

      // --- de-dupe against already-pushed ids ---
      const ids = candidates.map((c) => c.id)
      const { data: alreadySent } = await admin
        .from('push_sent')
        .select('notification_id')
        .eq('user_id', uid)
        .in('notification_id', ids)
      const sentSet = new Set((alreadySent ?? []).map((r: { notification_id: string }) => r.notification_id))
      const fresh = candidates.filter((c) => !sentSet.has(c.id)).slice(0, MAX_PER_USER)
      if (fresh.length === 0) continue

      // --- deliver each fresh alert to every live subscription ---
      for (const note of fresh) {
        let delivered = false
        for (const sub of userSubs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({ title: note.title, body: note.body, href: note.href, tag: note.id }),
            )
            delivered = true
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode
            if (status === 404 || status === 410) {
              await admin.from('push_subscriptions').delete().eq('id', sub.id)
            } else {
              errors.push(`${uid}/${sub.id}: ${e instanceof Error ? e.message : String(e)}`)
            }
          }
        }
        // Record as sent only if it reached at least one device, so a transient
        // failure (or no live device) is retried on the next run.
        if (delivered) {
          await admin.from('push_sent').insert({ user_id: uid, notification_id: note.id })
          sent++
        }
      }
    } catch (e) {
      errors.push(`${uid}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return json({ users: byUser.size, sent, ...(errors.length ? { errors } : {}) })
})
