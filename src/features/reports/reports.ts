import { eachDayOfInterval, eachMonthOfInterval, format } from 'date-fns'
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
