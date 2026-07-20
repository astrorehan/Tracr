import { useMemo } from 'react'
import { differenceInCalendarDays, endOfMonth, startOfMonth, subMonths } from 'date-fns'
import { useAccounts, useBalances } from '@/features/accounts/api'
import { useTransactions } from '@/features/transactions/api'
import { useTransactionSplits } from '@/features/transactions/splits'
import { useCategories } from '@/features/categories/api'
import { useRecurring } from '@/features/recurring/api'
import { useFxRates } from '@/features/fx/api'
import { useAuth } from '@/features/auth/useAuth'
import { overallMonthlyBudget, useBudgetStatuses } from '@/features/budgets/useBudgetStatuses'
import { buildRateTable, convertMinor } from '@/features/fx/fx'
import { categoryBreakdown, type CategorySlice } from '@/features/reports/reports'
import {
  activeDays,
  baseRatio,
  billsAhead,
  burnRate,
  dailyAllowance,
  flowBetween,
  forecastMonthEnd,
  historyDays,
  incomeAhead,
  runway,
  scoreTip,
  snapshotMoney,
  walletScore,
  type BillsAhead,
  type DailyAllowance,
  type MonthEndForecast,
  type MoneySnapshot,
  type Runway,
  type ScoreTip,
  type WalletScore,
} from './health'
import type { PeriodTotals } from '@/features/reports/reports'

/** How far back the health metrics look. Long enough for a stable burn rate. */
const LOOKBACK_DAYS = 90
/** Bills inside this many days are "coming up" on the home screen. */
export const BILLS_WINDOW_DAYS = 14

/** One side of the month's flow, with the breakdown its card needs. */
export interface FlowDetail {
  total: number
  prevTotal: number
  count: number
  /** Categories ranked high→low, valued in base. */
  slices: CategorySlice[]
}

export interface WalletHealth {
  money: MoneySnapshot
  /** This month and last month, valued in base — the home strip's source. */
  month: PeriodTotals
  prevMonth: PeriodTotals
  /** Money in and money out this month, each with its own category breakdown. */
  inflow: FlowDetail
  outflow: FlowDetail
  allowance: DailyAllowance
  runway: Runway
  bills: BillsAhead
  /** Where spendable cash is headed by month end; `confident` mirrors the burn rate it's built on. */
  forecast: MonthEndForecast & { confident: boolean }
  score: WalletScore
  /** The single thing worth doing next, or null when nothing needs attention. */
  tip: ScoreTip | null
  /** True until the queries the metrics depend on have landed. */
  isLoading: boolean
}

/**
 * One hook behind every "how am I doing" figure on the home screen. It owns its
 * own 90-day transaction window (React Query dedupes it against the page's own
 * lists) and hands back finished numbers, so the page stays presentational.
 */
export function useWalletHealth(): WalletHealth {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'

  // Pinned once per mount: a `new Date()` in the render body would re-key the
  // query and re-run every memo on every render.
  const now = useMemo(() => new Date(), [])
  const fromIso = useMemo(
    () => new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString(),
    [now],
  )

  const { data: accounts = [], isLoading: la } = useAccounts()
  const { data: balances = {}, isLoading: lb } = useBalances()
  const { data: transactions = [], isLoading: lt } = useTransactions({ from: fromIso, limit: 2000 })
  const { data: recurring = [], isLoading: lr } = useRecurring()
  const { data: fxRates = [] } = useFxRates()
  const { data: categories = [] } = useCategories()
  const { data: splitsByTx = {} } = useTransactionSplits()
  const { items: budgetItems, isLoading: lbud } = useBudgetStatuses(now)

  return useMemo(() => {
    const table = buildRateTable(fxRates, base)
    const money = snapshotMoney(accounts, balances, base, table)

    const monthStart = startOfMonth(now)
    const prevStart = startOfMonth(subMonths(now, 1))
    const month = flowBetween(transactions, base, fxRates, monthStart, now)
    const prevMonth = flowBetween(transactions, base, fxRates, prevStart, endOfMonth(prevStart))

    // Same base valuation the headline totals use, so a card's slices always
    // add up to the number printed above them.
    const ratio = baseRatio(base, table)
    const monthTxns = transactions.filter((tx) => {
      const t = new Date(tx.occurred_at).getTime()
      return t >= monthStart.getTime() && t <= now.getTime()
    })
    const detail = (kind: 'income' | 'expense', total: number, prevTotal: number): FlowDetail => ({
      total,
      prevTotal,
      count: monthTxns.filter((tx) => tx.type === kind).length,
      slices: categoryBreakdown(monthTxns, categories, kind, splitsByTx, ratio),
    })
    const inflow = detail('income', month.income, prevMonth.income)
    const outflow = detail('expense', month.expense, prevMonth.expense)

    // Two windows: everything owed before month end feeds the daily allowance,
    // the shorter one is what the home screen actually lists.
    const daysToMonthEnd = Math.max(0, differenceInCalendarDays(endOfMonth(now), now))
    const billsThisMonth = billsAhead(recurring, base, table, daysToMonthEnd, now)
    const bills = billsAhead(recurring, base, table, BILLS_WINDOW_DAYS, now)

    // A blown overall budget still answers "what's left" — negative is a real answer.
    const overall = overallMonthlyBudget(budgetItems)
    const budgetRemaining = overall
      ? convertMinor(overall.status.remaining, overall.budget.currency, base, table)
      : null

    const allowance = dailyAllowance({
      txns: transactions,
      base,
      table,
      budgetRemaining,
      spendable: money.spendable,
      billsAhead: billsThisMonth.total,
      now,
    })

    const burn = burnRate(transactions, base, table, now, LOOKBACK_DAYS)
    // Runway is measured against reserves, not just cash — money parked in a
    // brokerage is still a cushion, just a slower one.
    const rw = runway(money.reserves, burn)

    const scheduledIncome = incomeAhead(recurring, base, table, daysToMonthEnd, now)
    const forecast = {
      ...forecastMonthEnd({
        spendable: money.spendable,
        scheduledIncome,
        billsAhead: billsThisMonth.total,
        dailyBurn: burn.daily,
        now,
      }),
      confident: burn.confident,
    }

    const activeDaysLast14 = activeDays(transactions, 14, now)
    const overBudgetCount = budgetItems.filter((i) => i.status.level === 'over').length

    const score = walletScore({
      income: month.income,
      net: month.net,
      runway: rw,
      assets: money.assets,
      debts: money.debts,
      cardUsage: money.cardUsage,
      budgets: budgetItems.map((i) => ({ over: i.status.level === 'over' })),
      activeDaysLast14,
      historyDays: historyDays(transactions, now),
    })

    const tip = scoreTip(score, {
      income: month.income,
      net: month.net,
      runway: rw,
      assets: money.assets,
      debts: money.debts,
      cardUsage: money.cardUsage,
      overBudgetCount,
      activeDaysLast14,
    })

    return {
      money,
      month,
      prevMonth,
      inflow,
      outflow,
      allowance,
      runway: rw,
      bills,
      forecast,
      score,
      tip,
      isLoading: la || lb || lt || lr || lbud,
    }
  }, [
    accounts,
    balances,
    transactions,
    recurring,
    fxRates,
    categories,
    splitsByTx,
    budgetItems,
    base,
    now,
    la,
    lb,
    lt,
    lr,
    lbud,
  ])
}
