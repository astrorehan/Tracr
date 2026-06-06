import { eachDayOfInterval, eachMonthOfInterval, endOfDay, endOfMonth, format } from 'date-fns'
import type { Category, Transaction, TransactionSplit } from '@/types/db'
import { categoryContributions } from '@/features/transactions/splits'

/** Income / expense / net totals (minor units) over a set of transactions. */
export interface PeriodTotals {
  income: number
  expense: number
  net: number
  count: number
}

export function periodTotals(txns: Transaction[]): PeriodTotals {
  let income = 0
  let expense = 0
  for (const tx of txns) {
    if (tx.type === 'income') income += tx.amount
    else if (tx.type === 'expense') expense += tx.amount
  }
  return { income, expense, net: income - expense, count: txns.length }
}

export type Granularity = 'day' | 'month'

/** Daily buckets for short ranges, monthly for longer ones (keeps bars readable). */
export function pickGranularity(from: Date, to: Date): Granularity {
  const days = (to.getTime() - from.getTime()) / 86_400_000
  return days <= 62 ? 'day' : 'month'
}

export interface TimeBucket {
  key: string
  label: string
  income: number
  expense: number
  net: number
}

function bucketKey(d: Date, gran: Granularity) {
  return gran === 'month'
    ? { key: format(d, 'yyyy-MM'), label: format(d, 'MMM yy') }
    : { key: format(d, 'yyyy-MM-dd'), label: format(d, 'd MMM') }
}

/** Income vs expense (and net) per day/month, with empty buckets seeded for continuity. */
export function bucketByTime(
  txns: Transaction[],
  from: Date,
  to: Date,
  gran: Granularity,
): TimeBucket[] {
  const buckets = new Map<string, TimeBucket>()
  const span = gran === 'month' ? eachMonthOfInterval({ start: from, end: to }) : eachDayOfInterval({ start: from, end: to })
  for (const d of span) {
    const { key, label } = bucketKey(d, gran)
    buckets.set(key, { key, label, income: 0, expense: 0, net: 0 })
  }
  for (const tx of txns) {
    const { key } = bucketKey(new Date(tx.occurred_at), gran)
    const b = buckets.get(key)
    if (!b) continue
    if (tx.type === 'income') b.income += tx.amount
    else if (tx.type === 'expense') b.expense += tx.amount
  }
  const arr = Array.from(buckets.values())
  for (const b of arr) b.net = b.income - b.expense
  return arr
}

export interface NetWorthPoint {
  key: string
  label: string
  /** Net worth in base-currency minor units at the end of this bucket. */
  value: number
}

/** A transaction's base-valued effect on net worth, at a point in time. */
export interface NetWorthDelta {
  t: number
  d: number
}

/**
 * Net-worth-over-time, valued at LATEST rates so the final point equals the
 * dashboard's current net worth. We can't sum balances historically per bucket
 * cheaply, so we work *backwards*: net worth at a boundary = current net worth
 * minus every base-valued movement that happened after it.
 */
export function netWorthSeries(
  nwNow: number,
  deltas: NetWorthDelta[],
  from: Date,
  to: Date,
  gran: Granularity,
): NetWorthPoint[] {
  const span =
    gran === 'month'
      ? eachMonthOfInterval({ start: from, end: to })
      : eachDayOfInterval({ start: from, end: to })
  const sorted = [...deltas].sort((a, b) => a.t - b.t)
  const totalD = sorted.reduce((s, x) => s + x.d, 0)

  const points: NetWorthPoint[] = []
  let idx = 0
  let consumed = 0 // sum of deltas at or before the current boundary
  for (const d of span) {
    const cutoff = Math.min(+(gran === 'month' ? endOfMonth(d) : endOfDay(d)), +to)
    while (idx < sorted.length && sorted[idx].t <= cutoff) {
      consumed += sorted[idx].d
      idx++
    }
    const after = totalD - consumed
    const { key, label } = bucketKey(d, gran)
    points.push({ key, label, value: nwNow - after })
  }
  return points
}

export interface CategorySlice {
  id: string
  name: string
  color: string
  icon: string | null
  total: number
  pct: number
}

const UNCATEGORIZED = '#94a3b8'

/**
 * Spend (or income) grouped by category, ranked high→low, with % of total.
 * Split transactions are expanded into their per-category contributions.
 */
export function categoryBreakdown(
  txns: Transaction[],
  categories: Category[],
  kind: 'expense' | 'income',
  splitsByTx: Record<string, TransactionSplit[]> = {},
): CategorySlice[] {
  const byId = new Map<string, number>()
  let uncategorized = 0
  let total = 0
  for (const tx of txns) {
    if (tx.type !== kind) continue
    for (const { categoryId, amount } of categoryContributions(tx, splitsByTx)) {
      total += amount
      if (categoryId) byId.set(categoryId, (byId.get(categoryId) ?? 0) + amount)
      else uncategorized += amount
    }
  }

  const catMap = new Map(categories.map((c) => [c.id, c]))
  const slices: CategorySlice[] = []
  for (const [id, amt] of byId) {
    const c = catMap.get(id)
    slices.push({
      id,
      name: c?.name ?? 'Unknown',
      color: c?.color ?? UNCATEGORIZED,
      icon: c?.icon ?? null,
      total: amt,
      pct: total ? (amt / total) * 100 : 0,
    })
  }
  if (uncategorized > 0) {
    slices.push({
      id: '__uncat',
      name: 'Uncategorized',
      color: UNCATEGORIZED,
      icon: null,
      total: uncategorized,
      pct: total ? (uncategorized / total) * 100 : 0,
    })
  }
  return slices.sort((a, b) => b.total - a.total)
}

export interface PayeeSlice {
  name: string
  total: number
  count: number
  pct: number
}

/** Spend (or income) grouped by payee, ranked high→low. Untagged payees are dropped. */
export function payeeBreakdown(
  txns: Transaction[],
  kind: 'expense' | 'income',
): PayeeSlice[] {
  const byPayee = new Map<string, { total: number; count: number }>()
  let total = 0
  for (const tx of txns) {
    if (tx.type !== kind) continue
    const name = tx.payee?.trim()
    if (!name) continue
    total += tx.amount
    const cur = byPayee.get(name) ?? { total: 0, count: 0 }
    cur.total += tx.amount
    cur.count += 1
    byPayee.set(name, cur)
  }
  return Array.from(byPayee, ([name, v]) => ({
    name,
    total: v.total,
    count: v.count,
    pct: total ? (v.total / total) * 100 : 0,
  })).sort((a, b) => b.total - a.total)
}
