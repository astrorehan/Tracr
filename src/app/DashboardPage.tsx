import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format, subMonths, startOfMonth } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'
import { Wallet } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { EmptyState, Skeleton } from '@/components/ui/States'
import { chartCursor, chartTooltipStyle } from '@/lib/chartTheme'
import { pctChange } from '@/features/reports/reports'
import { formatMoney } from '@/lib/money'
import { getCurrency } from '@/lib/currencies'
import { useAuth } from '@/features/auth/useAuth'
import { useAccounts, useBalances } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import { useTransactions } from '@/features/transactions/api'
import { useFxRates } from '@/features/fx/api'
import { buildRateTable, convertMinor } from '@/features/fx/fx'
import { TransactionRow } from '@/features/transactions/TransactionRow'
import { accountTypeMeta } from '@/features/accounts/meta'
import { indexById } from '@/lib/collections'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'

  const { data: accounts = [], isLoading: la } = useAccounts()
  const { data: balances = {}, isLoading: lb } = useBalances()
  const { data: categories = [] } = useCategories()
  const { data: transactions = [], isLoading: lt } = useTransactions({ limit: 500 })
  const { data: fxRates = [] } = useFxRates()

  const accountMap = useMemo(() => indexById(accounts), [accounts])
  const categoryMap = useMemo(() => indexById(categories), [categories])

  // Totals grouped by currency (kept as the source of truth, shown per currency).
  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const a of accounts) {
      if (a.exclude_from_stats) continue
      totals[a.currency] = (totals[a.currency] ?? 0) + (balances[a.id] ?? a.opening_balance)
    }
    return totals
  }, [accounts, balances])

  // Net worth converted to the base currency at the latest known rates (display
  // only — native balances are never rewritten). Tracks currencies we can't yet
  // convert so we can prompt the user to add a rate instead of showing a wrong total.
  const netWorth = useMemo(() => {
    const table = buildRateTable(fxRates, base)
    let total = 0
    let assets = 0
    let debts = 0
    const missing = new Set<string>()
    for (const a of accounts) {
      if (a.exclude_from_stats) continue
      const bal = balances[a.id] ?? a.opening_balance
      const converted = convertMinor(bal, a.currency, base, table)
      if (converted == null) {
        missing.add(a.currency)
        continue
      }
      total += converted
      if (a.is_liability) debts += Math.abs(converted)
      else assets += converted
    }
    return { total, assets, debts, missing: [...missing] }
  }, [accounts, balances, fxRates, base])

  // Last 6 months of expenses in the base currency.
  const chartData = useMemo(() => {
    const months: { key: string; label: string; total: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = startOfMonth(subMonths(new Date(), i))
      months.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM'), total: 0 })
    }
    const index = new Map(months.map((m) => [m.key, m]))
    for (const tx of transactions) {
      if (tx.type !== 'expense' || tx.currency !== base) continue
      const key = format(new Date(tx.occurred_at), 'yyyy-MM')
      const m = index.get(key)
      if (m) m.total += tx.amount
    }
    return months
  }, [transactions, base])

  // This-month cashflow in base currency, plus last month as the comparison
  // baseline for the ▲/▼ trend chips on the stat cards.
  const month = useMemo(() => {
    const cur = format(new Date(), 'yyyy-MM')
    const prev = format(subMonths(new Date(), 1), 'yyyy-MM')
    let spent = 0
    let earned = 0
    let prevSpent = 0
    let prevEarned = 0
    for (const tx of transactions) {
      if (tx.currency !== base) continue
      const key = format(new Date(tx.occurred_at), 'yyyy-MM')
      if (key === cur) {
        if (tx.type === 'expense') spent += tx.amount
        else if (tx.type === 'income') earned += tx.amount
      } else if (key === prev) {
        if (tx.type === 'expense') prevSpent += tx.amount
        else if (tx.type === 'income') prevEarned += tx.amount
      }
    }
    return { spent, earned, net: earned - spent, prevSpent, prevEarned }
  }, [transactions, base])

  const recent = transactions.slice(0, 7)
  const otherCurrencies = Object.entries(totalsByCurrency).filter(([c]) => c !== base)
  const loading = la || lb || lt

  // Allocation of net worth across accounts, each converted to the base currency.
  // Asset allocation: share of total assets (liabilities excluded so the bar
  // sums to ~100% and isn't skewed by debts).
  const allocation = useMemo(() => {
    if (netWorth.assets <= 0) return []
    const table = buildRateTable(fxRates, base)
    return accounts
      .filter((a) => !a.is_liability && !a.exclude_from_stats)
      .map((a) => {
        const converted = convertMinor(balances[a.id] ?? a.opening_balance, a.currency, base, table)
        return {
          id: a.id,
          color: a.color ?? '#9a8c74',
          pct: converted == null ? 0 : (converted / netWorth.assets) * 100,
        }
      })
      .filter((x) => x.pct > 0.5)
      .sort((a, b) => b.pct - a.pct)
  }, [accounts, balances, fxRates, base, netWorth.assets])
  const pctById: Record<string, number> = {}
  for (const x of allocation) pctById[x.id] = x.pct

  if (loading) return <DashboardSkeleton />

  return (
    <div className="space-y-6">
      {/* Masthead — date stamp, greeting, and one true sentence about the month */}
      <header className="animate-rise py-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {format(new Date(), 'EEEE, d MMMM yyyy')}
        </p>
        <h1 className="mt-1 text-[26px] font-black tracking-tight lg:text-3xl">
          {greeting()}
          {profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}.
        </h1>
        {accounts.length > 0 && (
          <p className="mt-1.5 text-sm text-muted-foreground">{monthLine(month, base)}</p>
        )}
      </header>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-7 w-7" />}
          title="Start your ledger"
          description="Add the first place your money lives — a wallet, a bank account, an e-wallet. Tracr keeps the book from there."
          action={
            <Link
              to="/accounts"
              className="btn-sheen rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-[1.06]"
            >
              Add an account
            </Link>
          }
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          {/* ───────── Main pane ───────── */}
          <div className="space-y-5 xl:col-span-2">
            {/* Statement head — net worth, set like the top of a paper statement */}
            <div className="grain animate-rise relative overflow-hidden rounded-[20px] border border-amber-400/20 bg-[#1e1810] p-6 text-white shadow-lg lg:p-7">
              <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-amber-400/25 blur-[70px]" />
              <div className="pointer-events-none absolute -bottom-20 -left-14 h-32 w-32 rounded-full bg-orange-500/10 blur-[80px]" />

              <div className="relative z-10">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="section-head text-lg text-amber-100/90">Net worth</h2>
                  <p className="text-[11px] font-medium text-amber-200/50">
                    as of {format(new Date(), 'd MMMM')} · in {base}
                  </p>
                </div>

                <p className="mt-3 font-numeric text-4xl font-extrabold leading-none tracking-tight lg:text-5xl">
                  <AnimatedNumber value={netWorth.total} format={(v) => formatMoney(v, base)} />
                </p>
                {otherCurrencies.length > 0 && netWorth.missing.length === 0 && (
                  <p className="mt-1.5 text-[10px] font-semibold text-amber-200/50">
                    ≈ estimated at latest rates
                  </p>
                )}
                {netWorth.missing.length > 0 && (
                  <Link
                    to="/settings"
                    className="mt-1.5 inline-block text-[10px] font-semibold text-amber-300/80 underline-offset-2 hover:underline"
                  >
                    Add a rate for {netWorth.missing.join(', ')} to include it
                  </Link>
                )}

                {netWorth.debts > 0 && (
                  <div className="mt-5 max-w-sm space-y-1.5 text-xs">
                    <div className="flex items-baseline gap-2.5 text-amber-100/80">
                      <span className="font-medium">What you own</span>
                      <span className="leaders" />
                      <span className="font-numeric font-bold text-amber-50">
                        {formatMoney(netWorth.assets, base, { signDisplay: 'never' })}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2.5 text-amber-100/80">
                      <span className="font-medium">What you owe</span>
                      <span className="leaders" />
                      <span className="font-numeric font-bold text-red-300">
                        −{formatMoney(netWorth.debts, base, { signDisplay: 'never' })}
                      </span>
                    </div>
                  </div>
                )}

                {otherCurrencies.length > 0 && (
                  <div className="mt-6">
                    <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400">
                      Other currencies
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {otherCurrencies.map(([c, total]) => {
                        const approx = convertMinor(total, c, base, buildRateTable(fxRates, base))
                        return (
                          <span
                            key={c}
                            className="rounded-lg border border-stone-700/50 bg-stone-800/60 px-2.5 py-1 font-numeric text-xs font-semibold text-stone-300"
                          >
                            {getCurrency(c).symbol} {formatMoney(total, c, { signDisplay: 'never' })}
                            {approx != null && (
                              <span className="ml-1 text-stone-500">
                                ≈ {formatMoney(approx, base, { signDisplay: 'never' })}
                              </span>
                            )}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Statement strip — money in, money out, and the verdict. Numbers in
                ink; only "Kept" takes a color. */}
            <div className="animate-rise stagger-1 card-surface grid grid-cols-1 divide-y divide-border overflow-hidden rounded-2xl sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <StatCell
                label="Money in"
                amount={month.earned}
                format={(v) => formatMoney(v, base, { signDisplay: 'never' })}
                delta={deltaOf(month.earned, month.prevEarned, true)}
                deltaLabel={`vs ${prevMonthName()}`}
              />
              <StatCell
                label="Money out"
                amount={month.spent}
                format={(v) => formatMoney(v, base, { signDisplay: 'never' })}
                delta={deltaOf(month.spent, month.prevSpent, false)}
                deltaLabel={`vs ${prevMonthName()}`}
              />
              <StatCell
                label="Kept"
                amount={month.net}
                format={(v) => formatMoney(v, base, { signDisplay: 'always' })}
                valueClass={month.net >= 0 ? 'text-positive' : 'text-negative'}
                delta={deltaOf(month.net, month.prevEarned - month.prevSpent, true)}
                deltaLabel={`vs ${prevMonthName()}`}
              />
            </div>

            {/* Spending chart */}
            <Card className="animate-rise stagger-2 p-5">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 className="section-head text-[17px] text-foreground">Six months of spending</h2>
                <Link
                  to="/reports"
                  className="shrink-0 text-xs font-semibold text-primary transition hover:underline"
                >
                  Reports →
                </Link>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.12} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    stroke="var(--muted-foreground)"
                  />
                  <Tooltip
                    cursor={chartCursor}
                    contentStyle={chartTooltipStyle}
                    formatter={(value) => [formatMoney(Number(value), base), 'Spent']}
                  />
                  {/* Current month leads; history recedes at lower opacity */}
                  <Bar dataKey="total" fill="url(#barGradient)" radius={[3, 3, 0, 0]} maxBarSize={40}>
                    {chartData.map((m, i) => (
                      <Cell key={m.key} opacity={i === chartData.length - 1 ? 1 : 0.45} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Recent activity — a ruled list straight on the page, like ledger paper */}
            <div className="animate-rise stagger-3">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="section-head text-[17px] text-foreground">Recent activity</h2>
                <Link
                  to="/transactions"
                  className="text-xs font-semibold text-primary transition hover:underline"
                >
                  See all
                </Link>
              </div>
              {recent.length === 0 ? (
                <EmptyState
                  title="Nothing written down yet"
                  description="Press + and give the first one a home."
                />
              ) : (
                <div className="divide-y divide-border px-1">
                  {recent.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      tx={tx}
                      accounts={accountMap}
                      categories={categoryMap}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ───────── Right rail: accounts deck ───────── */}
          <aside className="animate-rise stagger-2 space-y-5">
            <div className="xl:sticky xl:top-[88px]">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="section-head text-[17px] text-foreground">Accounts</h2>
                <Link
                  to="/accounts"
                  className="text-xs font-semibold text-primary transition hover:underline"
                >
                  Manage
                </Link>
              </div>
              <Card className="px-3 py-3">
                {/* Allocation bar — share of base-currency net worth */}
                {allocation.length > 1 && (
                  <div className="mb-3 px-2 pt-1">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Allocation
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground">{base}</span>
                    </div>
                    <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
                      {allocation.map((x) => (
                        <div
                          key={x.id}
                          className="h-full first:rounded-l-full last:rounded-r-full"
                          style={{ width: `${x.pct}%`, backgroundColor: x.color }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Leader-dot ledger lines: name …… balance */}
                <div className="space-y-0.5">
                  {accounts.map((a) => {
                    const meta = accountTypeMeta(a.type)
                    const pct = pctById[a.id]
                    const color = a.color ?? '#9a8c74'
                    return (
                      <div
                        key={a.id}
                        className="rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-muted/60"
                      >
                        <div className="flex items-baseline gap-2.5">
                          <span
                            className="h-2.5 w-2.5 shrink-0 self-center rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <p className="truncate text-sm font-semibold text-foreground">{a.name}</p>
                          <span className="leaders text-muted-foreground" />
                          <span
                            className={cn(
                              'shrink-0 font-numeric text-sm font-bold',
                              a.is_liability ? 'text-negative' : 'text-foreground',
                            )}
                          >
                            {formatMoney(balances[a.id] ?? a.opening_balance, a.currency)}
                          </span>
                        </div>
                        <p className="mt-0.5 pl-5 text-[11px] font-medium text-muted-foreground">
                          {meta.label}
                          {pct !== undefined ? ` · ${pct.toFixed(0)}% of what you own` : ''}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

interface Delta {
  pct: number
  /** Whether this direction of change is good (drives the chip color). */
  good: boolean
}

function deltaOf(cur: number, prev: number, higherIsBetter: boolean): Delta | undefined {
  const pct = pctChange(cur, prev)
  if (pct == null) return undefined
  return { pct, good: higherIsBetter ? pct >= 0 : pct <= 0 }
}

/** One column of the statement strip: tiny caps label, ink number, dated delta. */
function StatCell({
  label,
  amount,
  format: fmt,
  valueClass,
  delta,
  deltaLabel,
}: {
  label: string
  amount: number
  format: (value: number) => string
  valueClass?: string
  delta?: Delta
  deltaLabel?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5 sm:block sm:py-4">
      <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="min-w-0 text-right sm:mt-1.5 sm:text-left">
        <p
          className={cn(
            'truncate font-numeric text-lg font-extrabold leading-tight sm:text-xl',
            valueClass ?? 'text-foreground',
          )}
        >
          <AnimatedNumber value={amount} format={fmt} />
        </p>
        {delta && (
          <p className="mt-0.5 truncate text-[11px] font-semibold">
            <span className={delta.good ? 'text-positive' : 'text-negative'}>
              {delta.pct >= 0 ? '▲' : '▼'} {Math.abs(delta.pct).toFixed(0)}%
            </span>{' '}
            <span className="font-medium text-muted-foreground">{deltaLabel}</span>
          </p>
        )}
      </div>
    </div>
  )
}

/** "May", "April" — deltas name the month they compare against. */
function prevMonthName() {
  return format(subMonths(new Date(), 1), 'MMMM')
}

/** One honest sentence about the month so far, written from the data. */
function monthLine(month: { earned: number; spent: number; net: number }, base: string) {
  const today = new Date()
  const name = format(today, 'MMMM')
  if (month.earned === 0 && month.spent === 0) return `Nothing in the book yet this ${name}.`
  const day = format(today, 'd')
  return month.net >= 0
    ? `Day ${day} of ${name} — you've kept ${formatMoney(month.net, base, { signDisplay: 'never' })} of what came in.`
    : `Day ${day} of ${name} — spending is ${formatMoney(-month.net, base, { signDisplay: 'never' })} ahead of income.`
}

/** Mirrors the dashboard grid so loading → loaded swaps without layout shift. */
function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <header className="py-1">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-8 w-64 max-w-full" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </header>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Skeleton className="h-44 rounded-[20px]" />
          <Skeleton className="h-[180px] rounded-2xl sm:h-[96px]" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
        <aside className="hidden xl:block">
          <Skeleton className="h-96 rounded-2xl" />
        </aside>
      </div>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
