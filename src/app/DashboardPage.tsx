import { useMemo, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { format, subMonths, startOfMonth } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { formatMoney } from '@/lib/money'
import { getCurrency } from '@/lib/currencies'
import { useAuth } from '@/features/auth/useAuth'
import { useAccounts, useBalances } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import { useTransactions } from '@/features/transactions/api'
import { TransactionRow } from '@/features/transactions/TransactionRow'
import { accountTypeMeta } from '@/features/accounts/meta'
import { indexById } from '@/lib/collections'

export function DashboardPage() {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'

  const { data: accounts = [], isLoading: la } = useAccounts()
  const { data: balances = {}, isLoading: lb } = useBalances()
  const { data: categories = [] } = useCategories()
  const { data: transactions = [], isLoading: lt } = useTransactions({ limit: 200 })

  const accountMap = useMemo(() => indexById(accounts), [accounts])
  const categoryMap = useMemo(() => indexById(categories), [categories])

  // Totals grouped by currency (no FX conversion yet — shown per currency).
  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const a of accounts) {
      totals[a.currency] = (totals[a.currency] ?? 0) + (balances[a.id] ?? a.opening_balance)
    }
    return totals
  }, [accounts, balances])

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

  // This-month cashflow in base currency (dense header metrics).
  const month = useMemo(() => {
    const key = format(new Date(), 'yyyy-MM')
    let spent = 0
    let earned = 0
    for (const tx of transactions) {
      if (tx.currency !== base) continue
      if (format(new Date(tx.occurred_at), 'yyyy-MM') !== key) continue
      if (tx.type === 'expense') spent += tx.amount
      else if (tx.type === 'income') earned += tx.amount
    }
    return { spent, earned, net: earned - spent }
  }, [transactions, base])

  const recent = transactions.slice(0, 7)
  const baseTotal = totalsByCurrency[base] ?? 0
  const otherCurrencies = Object.entries(totalsByCurrency).filter(([c]) => c !== base)
  const loading = la || lb || lt

  // Allocation of base-currency net worth across accounts (same currency = safe to sum).
  const allocation =
    baseTotal > 0
      ? accounts
          .filter((a) => a.currency === base)
          .map((a) => ({
            id: a.id,
            color: a.color ?? '#9a8c74',
            pct: ((balances[a.id] ?? a.opening_balance) / baseTotal) * 100,
          }))
          .filter((x) => x.pct > 0.5)
          .sort((a, b) => b.pct - a.pct)
      : []
  const pctById: Record<string, number> = {}
  for (const x of allocation) pctById[x.id] = x.pct

  if (loading) return <CenterSpinner />

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <header className="py-1">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">
          {greeting()}
          {profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''} 👋
        </h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Here is your financial status today.
        </p>
      </header>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-7 w-7" />}
          title="Welcome to Tracr"
          description="Create your first account to start tracking your money across cash, cards, e-wallets, crypto and stocks."
          action={
            <Link
              to="/accounts"
              className="btn-sheen rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-[1.06]"
            >
              Add your first account
            </Link>
          }
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          {/* ───────── Main pane ───────── */}
          <div className="space-y-5 xl:col-span-2">
            {/* Hero net worth */}
            <div className="grain animate-rise relative overflow-hidden rounded-[28px] border border-amber-400/20 bg-[#1e1810] p-6 text-white shadow-lg lg:p-7">
              <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-amber-400/25 blur-[70px]" />
              <div className="pointer-events-none absolute -bottom-20 -left-14 h-32 w-32 rounded-full bg-orange-500/10 blur-[80px]" />

              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/70">
                    Total Net Worth · {base}
                  </p>
                  <p className="mt-2.5 font-numeric text-4xl font-extrabold leading-none tracking-tight lg:text-5xl">
                    {formatMoney(baseTotal, base)}
                  </p>
                </div>
                {/* Card chip */}
                <div className="flex h-9 w-12 shrink-0 flex-col justify-between rounded-lg border border-amber-300/20 bg-gradient-to-br from-yellow-200/50 via-amber-300/30 to-amber-500/10 p-1.5 shadow-inner">
                  <div className="flex gap-0.5">
                    <div className="h-1.5 w-2 rounded-sm bg-slate-950/20" />
                    <div className="h-1.5 w-2 rounded-sm bg-slate-950/20" />
                  </div>
                  <div className="h-2 w-full rounded-sm bg-slate-950/20" />
                </div>
              </div>

              {otherCurrencies.length > 0 && (
                <div className="relative z-10 mt-6">
                  <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400">
                    Other currencies
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {otherCurrencies.map(([c, total]) => (
                      <span
                        key={c}
                        className="rounded-lg border border-stone-700/50 bg-stone-800/60 px-2.5 py-1 font-numeric text-xs font-semibold text-stone-300"
                      >
                        {getCurrency(c).symbol} {formatMoney(total, c, { signDisplay: 'never' })}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Dense cashflow metrics */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                label="Earned this month"
                value={formatMoney(month.earned, base, { signDisplay: 'never' })}
                icon={TrendingUp}
                tone="positive"
              />
              <StatCard
                label="Spent this month"
                value={formatMoney(month.spent, base, { signDisplay: 'never' })}
                icon={TrendingDown}
                tone="negative"
              />
            </div>

            {/* Spending chart */}
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <Link
                  to="/reports"
                  className="text-xs font-bold uppercase tracking-wider text-muted-foreground transition hover:text-primary"
                >
                  Spending · last 6 months →
                </Link>
                <span className="font-numeric text-sm font-bold text-foreground">
                  {formatMoney(month.spent, base, { signDisplay: 'never' })}
                  <span className="ml-1 text-[11px] font-semibold text-muted-foreground">
                    this month
                  </span>
                </span>
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
                    cursor={{ fill: 'var(--surface-muted)', opacity: 0.5, radius: 8 }}
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      fontSize: 12,
                      boxShadow: 'var(--shadow-md)',
                    }}
                    formatter={(value) => [formatMoney(Number(value), base), 'Spent']}
                  />
                  <Bar dataKey="total" fill="url(#barGradient)" radius={[8, 8, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Recent activity */}
            <div>
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Recent activity
                </h2>
                <Link
                  to="/transactions"
                  className="text-xs font-semibold text-primary transition hover:underline"
                >
                  See all
                </Link>
              </div>
              {recent.length === 0 ? (
                <EmptyState title="No transactions yet" description="Tap + to add one." />
              ) : (
                <Card className="divide-y divide-border px-4 py-1">
                  {recent.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      tx={tx}
                      accounts={accountMap}
                      categories={categoryMap}
                    />
                  ))}
                </Card>
              )}
            </div>
          </div>

          {/* ───────── Right rail: accounts deck ───────── */}
          <aside className="space-y-5">
            <div className="xl:sticky xl:top-[88px]">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Accounts · {accounts.length}
                </h2>
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

                <div className="space-y-1">
                  {accounts.map((a) => {
                    const meta = accountTypeMeta(a.type)
                    const Icon = meta.icon
                    const pct = pctById[a.id]
                    const color = a.color ?? '#9a8c74'
                    return (
                      <div
                        key={a.id}
                        className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-muted/60"
                      >
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
                          style={{ backgroundColor: `${color}1f`, color, borderColor: `${color}33` }}
                        >
                          <Icon className="h-4 w-4 stroke-[2.2]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold leading-tight text-foreground">
                            {a.name}
                          </p>
                          <p className="text-[11px] font-medium text-muted-foreground">
                            {meta.label}
                            {pct !== undefined ? ` · ${pct.toFixed(0)}%` : ''}
                          </p>
                        </div>
                        <span className="font-numeric text-sm font-bold text-foreground">
                          {formatMoney(balances[a.id] ?? a.opening_balance, a.currency)}
                        </span>
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

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: ComponentType<{ className?: string }>
  tone: 'positive' | 'negative'
}) {
  const toneCls = tone === 'positive' ? 'text-positive bg-positive/10' : 'text-negative bg-negative/10'
  return (
    <Card className="flex items-center gap-3.5 p-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneCls}`}>
        <Icon className="h-5 w-5 stroke-[2.2]" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 truncate font-numeric text-lg font-extrabold leading-tight text-foreground">
          {value}
        </p>
      </div>
    </Card>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
