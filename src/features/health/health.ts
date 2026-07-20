import { differenceInCalendarDays, endOfMonth, format, startOfMonth } from 'date-fns'
import type { Account, AccountType, FxRate, RecurringTransaction, Transaction } from '@/types/db'
import { convertMinor, type RateTable } from '@/features/fx/fx'
import { totalsInBase, type PeriodTotals } from '@/features/reports/reports'

/**
 * Derived "how am I doing" metrics for the home screen. Everything here is a
 * pure function of data the client already has — no schema, no backend. Values
 * are base-currency minor units unless noted.
 *
 * Two rules run through the whole module:
 *  - A metric we cannot measure honestly returns null rather than 0, so the UI
 *    can stay quiet instead of showing a scary wrong number.
 *  - Transactions are valued by their frozen `base_amount` first and a live rate
 *    second, so multi-currency books don't silently drop rows.
 */

/** Account types whose balance is money you could actually spend today. */
export const SPENDABLE_TYPES: ReadonlySet<AccountType> = new Set<AccountType>([
  'cash',
  'bank_card',
  'e_wallet',
])

/**
 * Spendable money plus holdings you could realistically convert within weeks.
 * The distinction matters: someone who keeps a thin current-account float and
 * tops it up from a brokerage isn't broke, and judging their cushion on cash
 * alone would say they are. Debts, receivables and `other` stay out — the first
 * two aren't yours to spend and the last is too vague to bank on.
 */
export const RESERVE_TYPES: ReadonlySet<AccountType> = new Set<AccountType>([
  ...SPENDABLE_TYPES,
  'stocks',
  'crypto',
])

/** Value one transaction in the base currency; null when no rate is known. */
export function txBase(tx: Transaction, base: string, table: RateTable): number | null {
  if (tx.base_amount != null) return tx.base_amount
  return convertMinor(tx.amount, tx.currency, base, table)
}

/**
 * Ratio that scales a transaction's native amount into the base currency, for
 * `categoryBreakdown`. Uses the frozen snapshot where there is one so a card's
 * slices always add up to the same total the headline figure shows.
 */
export function baseRatio(base: string, table: RateTable): (tx: Transaction) => number | null {
  return (tx) => {
    if (tx.currency === base) return 1
    if (tx.amount === 0) return null
    const valued = txBase(tx, base, table)
    return valued == null ? null : valued / tx.amount
  }
}

function inRange(tx: Transaction, start: Date, end: Date): boolean {
  const t = new Date(tx.occurred_at).getTime()
  return t >= start.getTime() && t <= end.getTime()
}

/** Base-valued expense total over [start, end]; unvaluable rows are skipped. */
export function expenseBetween(
  txns: Transaction[],
  base: string,
  table: RateTable,
  start: Date,
  end: Date,
): number {
  let sum = 0
  for (const tx of txns) {
    if (tx.type !== 'expense' || !inRange(tx, start, end)) continue
    const v = txBase(tx, base, table)
    if (v != null) sum += v
  }
  return sum
}

/**
 * Income/expense/net over [start, end], valued in base. Unlike a naive
 * `currency === base` filter this keeps foreign-currency rows, so the home
 * screen agrees with the Reports page for multi-currency books.
 */
export function flowBetween(
  txns: Transaction[],
  base: string,
  fxRates: FxRate[],
  start: Date,
  end: Date,
): PeriodTotals {
  return totalsInBase(
    txns.filter((tx) => inRange(tx, start, end)),
    base,
    fxRates,
  )
}

/* ───────────────────────── money snapshot ───────────────────────── */

export interface MoneySnapshot {
  /** Net worth: assets minus debts. */
  total: number
  assets: number
  /** Debts as a positive number. */
  debts: number
  /** Money you can spend today — drives the daily allowance. */
  spendable: number
  /** Spendable plus investments — the cushion runway is measured against. */
  reserves: number
  /** Card balance ÷ credit limit, 0..1+, across cards that declare a limit; null = none do. */
  cardUsage: number | null
  /** Currencies we hold but can't convert — the UI prompts for a rate. */
  missing: string[]
}

/** Roll every non-excluded account up into the headline money figures. */
export function snapshotMoney(
  accounts: Account[],
  balances: Record<string, number>,
  base: string,
  table: RateTable,
): MoneySnapshot {
  let total = 0
  let assets = 0
  let debts = 0
  let spendable = 0
  let reserves = 0
  let cardUsed = 0
  let cardLimit = 0
  const missing = new Set<string>()

  for (const a of accounts) {
    if (a.exclude_from_stats) continue
    const balance = balances[a.id] ?? a.opening_balance
    const converted = convertMinor(balance, a.currency, base, table)
    if (converted == null) {
      missing.add(a.currency)
      continue
    }
    total += converted
    if (a.is_liability) {
      debts += Math.abs(converted)
      if (a.credit_limit != null && a.credit_limit > 0) {
        const limit = convertMinor(a.credit_limit, a.currency, base, table)
        if (limit != null) {
          cardLimit += limit
          cardUsed += Math.abs(converted)
        }
      }
    } else {
      assets += converted
      // A negative balance on an asset account is an overdraft, not spendable.
      const usable = Math.max(0, converted)
      if (SPENDABLE_TYPES.has(a.type)) spendable += usable
      if (RESERVE_TYPES.has(a.type)) reserves += usable
    }
  }

  return {
    total,
    assets,
    debts,
    spendable,
    reserves,
    cardUsage: cardLimit > 0 ? cardUsed / cardLimit : null,
    missing: [...missing],
  }
}

/* ───────────────────────── burn rate & runway ───────────────────────── */

/** Fewer days than this and an extrapolated monthly figure is noise, not signal. */
const MIN_BURN_DAYS = 14
const BURN_WINDOW_DAYS = 90

export interface BurnRate {
  /** Average spend per calendar day across the observed window. */
  daily: number
  /** `daily` projected over 30 days. */
  monthly: number
  /** Days of history actually seen (capped at the window). */
  observedDays: number
  /** False when there's too little history to extrapolate from. */
  confident: boolean
}

/**
 * Average spend per day over the trailing window. We divide by the days we
 * actually observed rather than the full window, so someone two weeks into
 * using the app isn't told their burn is a third of what it really is.
 */
export function burnRate(
  txns: Transaction[],
  base: string,
  table: RateTable,
  now: Date = new Date(),
  windowDays: number = BURN_WINDOW_DAYS,
): BurnRate {
  const start = new Date(now.getTime() - windowDays * 86_400_000)
  let sum = 0
  let earliest = Infinity
  for (const tx of txns) {
    if (!inRange(tx, start, now)) continue
    const t = new Date(tx.occurred_at).getTime()
    if (t < earliest) earliest = t
    if (tx.type !== 'expense') continue
    const v = txBase(tx, base, table)
    if (v != null) sum += v
  }

  const spanDays = earliest === Infinity ? 0 : differenceInCalendarDays(now, new Date(earliest)) + 1
  const observedDays = Math.min(windowDays, Math.max(spanDays, 0))
  const daily = observedDays > 0 ? sum / observedDays : 0
  return {
    daily,
    monthly: Math.round(daily * 30),
    observedDays,
    confident: observedDays >= MIN_BURN_DAYS,
  }
}

/** Months of runway that counts as fully healthy. */
export const RUNWAY_TARGET_MONTHS = 6

export interface Runway {
  /** The cushion being measured — reserves, not just today's cash. */
  reserves: number
  monthlyBurn: number
  /** Months the reserves cover; null when we can't say (thin history). */
  months: number | null
  confident: boolean
}

export function runway(reserves: number, burn: BurnRate): Runway {
  const months = !burn.confident ? null : burn.monthly > 0 ? reserves / burn.monthly : null
  return { reserves, monthlyBurn: burn.monthly, months, confident: burn.confident }
}

/* ───────────────────────── daily allowance ───────────────────────── */

/** Where the "safe to spend" number came from — drives the copy and the CTA. */
export type AllowanceBasis = 'budget' | 'cash'

export interface DailyAllowance {
  basis: AllowanceBasis
  /** Money left for the rest of the month. Negative means the budget is blown. */
  available: number
  /** Calendar days left in the month, today included. Always ≥ 1. */
  daysLeft: number
  /**
   * Today's share of what's left. Fixed at the start of the day on purpose — if
   * it were recomputed from the live balance, recording a Rp 60k lunch would
   * drop today's allowance by more than Rp 60k (the spend gets re-spread across
   * every remaining day too), which reads as a punishment. Tomorrow it resets
   * against the new balance. Never negative.
   */
  perDay: number
  /** Base-valued spend booked for today. */
  spentToday: number
  /** `perDay − spentToday`; negative once today's share is used up. */
  leftToday: number
  /** Average daily spend so far this month, for the "usually" comparison. */
  avgPerDay: number
  /**
   * The cash-basis number is far below what this person actually spends per
   * day — usually because their money is parked in investments and the current
   * account runs thin. Presenting "Rp 1,082/day" as a plan would look broken;
   * the card switches to naming the shortfall instead.
   */
  tight: boolean
}

/** Below this share of normal daily spend, a cash-basis allowance isn't a plan. */
const TIGHT_RATIO = 0.5

export function dailyAllowance(opts: {
  txns: Transaction[]
  base: string
  table: RateTable
  /** Unspent overall monthly budget, or null when the user hasn't set one. */
  budgetRemaining: number | null
  /** Spendable cash — the fallback basis when there's no budget. */
  spendable: number
  /** Bills falling due between now and month end. */
  billsAhead: number
  now?: Date
}): DailyAllowance {
  const { txns, base, table, budgetRemaining, spendable, billsAhead, now = new Date() } = opts

  const basis: AllowanceBasis = budgetRemaining != null ? 'budget' : 'cash'
  const available = budgetRemaining ?? spendable - billsAhead
  const daysLeft = Math.max(1, differenceInCalendarDays(endOfMonth(now), now) + 1)

  const dayKey = format(now, 'yyyy-MM-dd')
  let spentToday = 0
  for (const tx of txns) {
    if (tx.type !== 'expense') continue
    if (format(new Date(tx.occurred_at), 'yyyy-MM-dd') !== dayKey) continue
    const v = txBase(tx, base, table)
    if (v != null) spentToday += v
  }

  // Rewind to this morning's balance so today's share doesn't shrink as it's spent.
  const perDay = Math.floor(Math.max(0, available + spentToday) / daysLeft)

  const monthStart = startOfMonth(now)
  const elapsed = differenceInCalendarDays(now, monthStart) + 1
  const avgPerDay = Math.round(expenseBetween(txns, base, table, monthStart, now) / elapsed)

  return {
    basis,
    available,
    daysLeft,
    perDay,
    spentToday,
    leftToday: perDay - spentToday,
    avgPerDay,
    tight: basis === 'cash' && avgPerDay > 0 && perDay < avgPerDay * TIGHT_RATIO,
  }
}

/* ───────────────────────── bills ahead ───────────────────────── */

export interface BillAhead {
  rec: RecurringTransaction
  /** Days until due; negative when overdue. */
  days: number
  overdue: boolean
  /** Amount in base currency; null when no rate is known. */
  base: number | null
}

export interface BillsAhead {
  items: BillAhead[]
  /** Base-valued total of everything in `items` we could value. */
  total: number
  overdueCount: number
  /** True when at least one bill couldn't be valued in base. */
  partial: boolean
}

/**
 * Active expense schedules that are overdue or fall due within `withinDays`,
 * soonest first. Income schedules are left out — this answers "what do I owe",
 * not "what's coming in".
 */
export function billsAhead(
  recurring: RecurringTransaction[],
  base: string,
  table: RateTable,
  withinDays = 14,
  now: Date = new Date(),
): BillsAhead {
  const items: BillAhead[] = []
  let total = 0
  let overdueCount = 0
  let partial = false

  for (const rec of recurring) {
    if (!rec.is_active || rec.type !== 'expense') continue
    const days = differenceInCalendarDays(new Date(`${rec.next_due}T12:00:00`), now)
    if (days > withinDays) continue
    const value = convertMinor(rec.amount, rec.currency, base, table)
    if (value == null) partial = true
    else total += value
    if (days < 0) overdueCount++
    items.push({ rec, days, overdue: days < 0, base: value })
  }

  items.sort((a, b) => a.days - b.days)
  return { items, total, overdueCount, partial }
}

/**
 * Base-valued total of active income schedules due within `withinDays` —
 * salary, transfers in, and so on. The forecast card only needs a total (not
 * a list to render), so unvaluable rows are silently skipped rather than
 * flagged the way `billsAhead` flags them.
 */
export function incomeAhead(
  recurring: RecurringTransaction[],
  base: string,
  table: RateTable,
  withinDays: number,
  now: Date = new Date(),
): number {
  let total = 0
  for (const rec of recurring) {
    if (!rec.is_active || rec.type !== 'income') continue
    const days = differenceInCalendarDays(new Date(`${rec.next_due}T12:00:00`), now)
    if (days > withinDays) continue
    const value = convertMinor(rec.amount, rec.currency, base, table)
    if (value != null) total += value
  }
  return total
}

/* ───────────────────────── month-end forecast ───────────────────────── */

export interface MonthEndForecast {
  /** Spendable cash right now. */
  current: number
  /** Spendable cash projected forward to month end. */
  projected: number
  /** True when the projection would dip below zero before the month is out. */
  shortfall: boolean
}

/**
 * Where spendable cash is headed by month end: today's balance, plus
 * schedules still due to arrive, minus schedules still due to go out, minus
 * ordinary day-to-day spending projected at the 90-day burn rate. Uses the
 * steadier 90-day rate rather than this month's pace-so-far, which a single
 * big day on the 2nd of the month would otherwise skew wildly. Only
 * meaningful once the burn rate has enough history — gate display on
 * `BurnRate.confident`.
 */
export function forecastMonthEnd(opts: {
  spendable: number
  scheduledIncome: number
  billsAhead: number
  dailyBurn: number
  now?: Date
}): MonthEndForecast {
  const now = opts.now ?? new Date()
  // Today's spend is already reflected in `spendable`, so only the days
  // strictly after today get projected forward.
  const daysAfterToday = Math.max(0, differenceInCalendarDays(endOfMonth(now), now))
  const projected =
    opts.spendable + opts.scheduledIncome - opts.billsAhead - opts.dailyBurn * daysAfterToday
  return { current: opts.spendable, projected, shortfall: projected < 0 }
}

/* ───────────────────────── logging habit ───────────────────────── */

/** Distinct calendar days carrying at least one transaction in the last `days`. */
export function activeDays(txns: Transaction[], days = 14, now: Date = new Date()): number {
  const start = new Date(now.getTime() - days * 86_400_000)
  const seen = new Set<string>()
  for (const tx of txns) {
    const d = new Date(tx.occurred_at)
    if (d < start || d > now) continue
    seen.add(format(d, 'yyyy-MM-dd'))
  }
  return seen.size
}

/** Calendar days from the oldest transaction to now — how long the book has run. */
export function historyDays(txns: Transaction[], now: Date = new Date()): number {
  let earliest = Infinity
  for (const tx of txns) {
    const t = new Date(tx.occurred_at).getTime()
    if (t < earliest) earliest = t
  }
  if (earliest === Infinity) return 0
  return Math.max(0, differenceInCalendarDays(now, new Date(earliest)) + 1)
}

/* ───────────────────────── wallet score ───────────────────────── */

export type ScoreKey = 'savings' | 'runway' | 'debt' | 'card' | 'budget' | 'habit'
export type Grade = 'great' | 'good' | 'fair' | 'weak'

export interface SubScore {
  key: ScoreKey
  /** 0..100, or null when there isn't enough data — the weight is then dropped. */
  value: number | null
  weight: number
}

export interface WalletScore {
  /** 0..100, weighted across the sub-scores we could actually measure. */
  score: number
  grade: Grade
  parts: SubScore[]
  /** The measured sub-score worth acting on; null when nothing is weak enough to nag about. */
  weakest: ScoreKey | null
  measured: number
}

/** Share of income kept that counts as fully healthy. */
export const SAVINGS_TARGET = 0.2
/** Card usage at or above this scores zero. */
const CARD_USAGE_FLOOR = 0.8
/** Days logged out of the last 14 that count as a full habit score. */
const HABIT_TARGET_DAYS = 10
/** Below this much history, the habit score would punish brand-new books. */
const MIN_HABIT_HISTORY_DAYS = 7
/** Only sub-scores below this are worth pointing at — above it, nothing needs fixing. */
const WEAKEST_THRESHOLD = 70

const WEIGHTS: Record<ScoreKey, number> = {
  savings: 25,
  runway: 25,
  debt: 15,
  card: 15,
  budget: 10,
  habit: 10,
}

/** Map a value onto 0..100. `hundredAt` may sit below `zeroAt` to invert. */
function ramp(value: number, zeroAt: number, hundredAt: number): number {
  if (hundredAt === zeroAt) return 100
  const t = (value - zeroAt) / (hundredAt - zeroAt)
  return Math.round(Math.min(1, Math.max(0, t)) * 100)
}

export function gradeOf(score: number): Grade {
  if (score >= 80) return 'great'
  if (score >= 60) return 'good'
  if (score >= 40) return 'fair'
  return 'weak'
}

/**
 * Six signals folded into one 0-100 number. Weights are renormalised over the
 * sub-scores we could measure, so someone who hasn't set up budgets or credit
 * cards isn't marked down for features they don't use.
 */
export function walletScore(input: {
  /** This month's base-valued income and net (income − expense). */
  income: number
  net: number
  runway: Runway
  assets: number
  debts: number
  cardUsage: number | null
  /** One entry per budget in the current period. */
  budgets: { over: boolean }[]
  activeDaysLast14: number
  historyDays: number
}): WalletScore {
  const parts: SubScore[] = []
  const add = (key: ScoreKey, value: number | null) =>
    parts.push({ key, value, weight: WEIGHTS[key] })

  add('savings', input.income > 0 ? ramp(input.net / input.income, 0, SAVINGS_TARGET) : null)

  add(
    'runway',
    !input.runway.confident
      ? null
      : input.runway.months == null
        ? // Confident history with no spend at all — nothing is draining the pile.
          100
        : ramp(input.runway.months, 0, RUNWAY_TARGET_MONTHS),
  )

  const hasBalanceSheet = input.assets > 0 || input.debts > 0
  add('debt', hasBalanceSheet ? ramp(input.debts / Math.max(input.assets, 1), 1, 0) : null)

  add('card', input.cardUsage != null ? ramp(input.cardUsage, CARD_USAGE_FLOOR, 0) : null)

  add(
    'budget',
    input.budgets.length > 0
      ? Math.round((input.budgets.filter((b) => !b.over).length / input.budgets.length) * 100)
      : null,
  )

  add(
    'habit',
    input.historyDays >= MIN_HABIT_HISTORY_DAYS
      ? ramp(input.activeDaysLast14, 0, HABIT_TARGET_DAYS)
      : null,
  )

  const measuredParts = parts.filter((p): p is SubScore & { value: number } => p.value != null)
  const totalWeight = measuredParts.reduce((s, p) => s + p.weight, 0)
  const score =
    totalWeight > 0
      ? Math.round(measuredParts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight)
      : 0

  // Worst first, then heaviest — the tie-break points at the fix that moves the
  // needle most. Anything above the threshold is healthy enough to stay quiet
  // about; nagging about a card at 5% usage would just be noise.
  const weakest =
    measuredParts
      .filter((p) => p.value < WEAKEST_THRESHOLD)
      .sort((a, b) => a.value - b.value || b.weight - a.weight)[0]?.key ?? null

  return { score, grade: gradeOf(score), parts, weakest, measured: measuredParts.length }
}

/**
 * Tip variants. Mostly one per sub-score, plus a few cases where the plain
 * wording would be nonsense — "you're keeping -5% of your income" is technically
 * right and completely useless.
 */
export type TipKey = ScoreKey | 'savingsNegative' | 'runwayDays'

/** A message key plus the numbers to interpolate into it. */
export interface ScoreTip {
  key: TipKey
  vars: Record<string, string | number>
}

/**
 * Turns the weakest sub-score into the one concrete sentence worth showing. The
 * card renders `score.tip.<key>` with these vars, so the wording (and its
 * translation) stays out of the maths.
 */
export function scoreTip(
  score: WalletScore,
  ctx: {
    income: number
    net: number
    runway: Runway
    assets: number
    debts: number
    cardUsage: number | null
    overBudgetCount: number
    activeDaysLast14: number
  },
): ScoreTip | null {
  const pct = (n: number) => Math.round(n * 100)
  switch (score.weakest) {
    case null:
      return null
    case 'savings':
      // Spending more than you earned isn't a savings rate, it's a shortfall.
      return ctx.net < 0
        ? { key: 'savingsNegative', vars: {} }
        : { key: 'savings', vars: { pct: ctx.income > 0 ? pct(ctx.net / ctx.income) : 0 } }
    case 'runway': {
      const months = ctx.runway.months ?? 0
      // Under a month, "0.4 months" is arithmetic, not an answer.
      return months < 1
        ? { key: 'runwayDays', vars: { n: Math.max(1, Math.round(months * 30)) } }
        : { key: 'runway', vars: { months: months.toFixed(1) } }
    }
    case 'debt':
      return { key: 'debt', vars: { pct: pct(ctx.debts / Math.max(ctx.assets, 1)) } }
    case 'card':
      return { key: 'card', vars: { pct: pct(ctx.cardUsage ?? 0) } }
    case 'budget':
      return { key: 'budget', vars: { n: ctx.overBudgetCount } }
    case 'habit':
      return { key: 'habit', vars: { n: ctx.activeDaysLast14 } }
  }
}
