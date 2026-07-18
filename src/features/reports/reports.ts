import { eachDayOfInterval, eachMonthOfInterval, endOfDay, endOfMonth, format } from 'date-fns'
import type { Category, FxRate, Tag, Transaction, TransactionSplit } from '@/types/db'
import { categoryContributions } from '@/features/transactions/splits'
import { buildRateTable, convertMinor } from '@/features/fx/fx'

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

/**
 * Income/expense/net totals valued in the base currency — for the comparison
 * (previous) period, where we only need headline numbers, not splits. Uses each
 * transaction's frozen snapshot when present, else the latest rate; transfers
 * and unvaluable rows are skipped (mirrors how the page values the current set).
 */
export function totalsInBase(txns: Transaction[], base: string, fxRates: FxRate[]): PeriodTotals {
  const table = buildRateTable(fxRates, base)
  let income = 0
  let expense = 0
  let count = 0
  for (const tx of txns) {
    if (tx.type === 'transfer') continue
    const bv = tx.base_amount != null ? tx.base_amount : convertMinor(tx.amount, tx.currency, base, table)
    if (bv == null) continue
    if (tx.type === 'income') income += bv
    else expense += bv
    count++
  }
  return { income, expense, net: income - expense, count }
}

/** Signed percentage change from `prev` to `cur`; null when there's no baseline. */
export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null
  return ((cur - prev) / Math.abs(prev)) * 100
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
 * Multiplier from a transaction's native amount into some other currency, or
 * null to leave it out. Lets a caller group in the base currency without this
 * module knowing anything about rates.
 */
export type AmountRatio = (tx: Transaction) => number | null

/**
 * Spend (or income) grouped by category, ranked high→low, with % of total.
 * Split transactions are expanded into their per-category contributions.
 * Pass `ratioOf` to value everything in one currency; omit it to group by
 * native amounts (fine for single-currency books).
 */
export function categoryBreakdown(
  txns: Transaction[],
  categories: Category[],
  kind: 'expense' | 'income',
  splitsByTx: Record<string, TransactionSplit[]> = {},
  ratioOf?: AmountRatio,
): CategorySlice[] {
  const byId = new Map<string, number>()
  let uncategorized = 0
  let total = 0
  for (const tx of txns) {
    if (tx.type !== kind) continue
    const ratio = ratioOf ? ratioOf(tx) : 1
    if (ratio == null) continue // can't value it — better absent than wrong
    for (const { categoryId, amount: native } of categoryContributions(tx, splitsByTx)) {
      const amount = ratio === 1 ? native : Math.round(native * ratio)
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

/** Per-day spend (or income) keyed by yyyy-MM-dd — drives the calendar heatmap. */
export function dailyTotals(
  txns: Transaction[],
  kind: 'expense' | 'income',
): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const tx of txns) {
    if (tx.type !== kind) continue
    const key = format(new Date(tx.occurred_at), 'yyyy-MM-dd')
    byDay.set(key, (byDay.get(key) ?? 0) + tx.amount)
  }
  return byDay
}

/** Resolve a category to its top-level ancestor id (one level of nesting in this app). */
export function topCategoryId(catId: string | null, catMap: Map<string, Category>): string | null {
  if (!catId) return null
  const c = catMap.get(catId)
  if (c?.parent_id && catMap.has(c.parent_id)) return c.parent_id
  return catId
}

export interface CategoryNode extends CategorySlice {
  /** Sub-breakdown by child category (pct relative to this node). Empty = not drillable. */
  children: CategorySlice[]
}

const DIRECT = '__direct'

/**
 * Category breakdown rolled up to top-level parents, each carrying a per-child
 * sub-breakdown so the UI can drill in. Amounts booked on a parent directly
 * (not a subcategory) surface as a "Direct" child only when the parent also has
 * subcategory activity. Splits are expanded; ranked high→low like {@link categoryBreakdown}.
 */
export function categoryTree(
  txns: Transaction[],
  categories: Category[],
  kind: 'expense' | 'income',
  splitsByTx: Record<string, TransactionSplit[]> = {},
): CategoryNode[] {
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const topTotals = new Map<string, number>()
  const childTotals = new Map<string, Map<string, number>>() // topId → (leafId → amount)
  let total = 0

  const add = (topId: string, leafId: string, amount: number) => {
    total += amount
    topTotals.set(topId, (topTotals.get(topId) ?? 0) + amount)
    const kids = childTotals.get(topId) ?? new Map<string, number>()
    kids.set(leafId, (kids.get(leafId) ?? 0) + amount)
    childTotals.set(topId, kids)
  }

  for (const tx of txns) {
    if (tx.type !== kind) continue
    for (const { categoryId, amount } of categoryContributions(tx, splitsByTx)) {
      if (!categoryId) {
        add('__uncat', '__uncat', amount)
        continue
      }
      const top = topCategoryId(categoryId, catMap) ?? categoryId
      const leaf = top === categoryId ? DIRECT : categoryId
      add(top, leaf, amount)
    }
  }

  const sliceFor = (id: string, amount: number, totalForPct: number): CategorySlice => {
    if (id === '__uncat')
      return { id, name: 'Uncategorized', color: UNCATEGORIZED, icon: null, total: amount, pct: totalForPct ? (amount / totalForPct) * 100 : 0 }
    if (id === DIRECT)
      return { id, name: 'Direct', color: UNCATEGORIZED, icon: null, total: amount, pct: totalForPct ? (amount / totalForPct) * 100 : 0 }
    const c = catMap.get(id)
    return {
      id,
      name: c?.name ?? 'Unknown',
      color: c?.color ?? UNCATEGORIZED,
      icon: c?.icon ?? null,
      total: amount,
      pct: totalForPct ? (amount / totalForPct) * 100 : 0,
    }
  }

  const nodes: CategoryNode[] = []
  for (const [topId, amt] of topTotals) {
    const kids = childTotals.get(topId) ?? new Map()
    // Only a real breakdown when there's more than one part (a lone "Direct" child is just the parent itself).
    const drillable = kids.size > 1 || (kids.size === 1 && !kids.has(DIRECT))
    const children = drillable
      ? Array.from(kids, ([leafId, leafAmt]) => sliceFor(leafId, leafAmt, amt)).sort((a, b) => b.total - a.total)
      : []
    nodes.push({ ...sliceFor(topId, amt, total), children })
  }
  return nodes.sort((a, b) => b.total - a.total)
}

export interface TagSlice {
  id: string
  name: string
  color: string
  total: number
  pct: number
}

/**
 * Spend (or income) by tag within a single top-level category — the tag half of
 * the category drill-down. Attributed at whole-transaction level via
 * `tx.category_id` (split transactions, which carry no single category, are
 * skipped here); untagged transactions are dropped.
 */
export function tagBreakdownForCategory(
  txns: Transaction[],
  topId: string,
  kind: 'expense' | 'income',
  categories: Category[],
  tags: Tag[],
  tagsByTx: Record<string, string[]>,
): TagSlice[] {
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const tagMap = new Map(tags.map((t) => [t.id, t]))
  const byTag = new Map<string, number>()
  let total = 0
  for (const tx of txns) {
    if (tx.type !== kind) continue
    const top = topId === '__uncat' ? topCategoryId(tx.category_id, catMap) ?? '__uncat' : topCategoryId(tx.category_id, catMap)
    if (top !== topId) continue
    const tagIds = tagsByTx[tx.id]
    if (!tagIds?.length) continue
    for (const id of tagIds) {
      total += tx.amount
      byTag.set(id, (byTag.get(id) ?? 0) + tx.amount)
    }
  }
  return Array.from(byTag, ([id, amt]) => {
    const t = tagMap.get(id)
    return { id, name: t?.name ?? 'Tag', color: t?.color ?? UNCATEGORIZED, total: amt, pct: total ? (amt / total) * 100 : 0 }
  }).sort((a, b) => b.total - a.total)
}
