import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'
import { BarChart3, Download, PieChart as PieIcon, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Input'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { CategoryIcon } from '@/features/categories/CategoryIcon'
import { useAuth } from '@/features/auth/useAuth'
import { useAccounts } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import { useTransactions } from '@/features/transactions/api'
import { useTransactionSplits } from '@/features/transactions/splits'
import {
  DATE_PRESETS,
  resolveDateRange,
  type DatePreset,
} from '@/features/transactions/filters'
import {
  bucketByTime,
  categoryBreakdown,
  periodTotals,
  pickGranularity,
} from '@/features/reports/reports'
import { toCsv, downloadTextFile } from '@/lib/csv'
import { formatMoney, fromMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types/db'

export function ReportsPage() {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'

  const [preset, setPreset] = useState<DatePreset>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [breakdownKind, setBreakdownKind] = useState<'expense' | 'income'>('expense')

  const range = { datePreset: preset, customFrom, customTo }
  const resolved = resolveDateRange(range)

  const { data: accounts = [] } = useAccounts(true)
  const { data: categories = [] } = useCategories()
  const { data: transactions = [], isLoading } = useTransactions({
    ...resolved,
    limit: 2000,
  })
  const { data: splitsByTx = {} } = useTransactionSplits()

  // Reports are computed in the base currency only (no FX conversion yet).
  const baseTxns = useMemo(
    () => transactions.filter((tx) => tx.currency === base && tx.type !== 'transfer'),
    [transactions, base],
  )

  const hasOtherCurrency = useMemo(
    () => accounts.some((a) => a.currency !== base),
    [accounts, base],
  )

  const totals = useMemo(() => periodTotals(baseTxns), [baseTxns])

  // Resolve concrete date bounds (fall back to data span when range is open-ended).
  const [from, to, now] = useMemo<[Date, Date, Date]>(() => {
    const now = new Date()
    const start = resolved.from
      ? new Date(resolved.from)
      : baseTxns.length
        ? new Date(Math.min(...baseTxns.map((t) => +new Date(t.occurred_at))))
        : now
    const end = resolved.to ? new Date(resolved.to) : now
    return [start, end, now]
  }, [resolved.from, resolved.to, baseTxns])

  const timeline = useMemo(
    () => bucketByTime(baseTxns, from, to, pickGranularity(from, to)),
    [baseTxns, from, to],
  )

  const breakdown = useMemo(
    () => categoryBreakdown(baseTxns, categories, breakdownKind, splitsByTx),
    [baseTxns, categories, breakdownKind, splitsByTx],
  )

  const biggest = useMemo(
    () => [...baseTxns].sort((a, b) => b.amount - a.amount).slice(0, 8),
    [baseTxns],
  )

  // Average over days elapsed so far (cap the end at today), not the whole period —
  // spending Rp3m on the 1st reads as Rp3m/day, then Rp1.5m/day on the 2nd, etc.
  const avgDailySpend = useMemo(() => {
    const elapsedEnd = Math.min(+to, +now)
    const dayCount = Math.max(1, Math.floor((elapsedEnd - +from) / 86_400_000) + 1)
    return totals.expense / dayCount
  }, [from, to, now, totals.expense])

  function exportCsv() {
    const rows: (string | number)[][] = [
      ['Report', `${breakdownKind} by category`],
      ['Period', `${format(from, 'yyyy-MM-dd')} to ${format(to, 'yyyy-MM-dd')}`],
      ['Currency', base],
      [],
      ['Category', 'Amount', 'Share %'],
      ...breakdown.map((s) => [s.name, fromMinorUnits(s.total, base), s.pct.toFixed(1)]),
      [],
      ['Total income', fromMinorUnits(totals.income, base)],
      ['Total expense', fromMinorUnits(totals.expense, base)],
      ['Net', fromMinorUnits(totals.net, base)],
    ]
    downloadTextFile(`tracr-report-${format(new Date(), 'yyyyMMdd')}.csv`, toCsv(rows))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Reports</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {format(from, 'd MMM yyyy')} – {format(to, 'd MMM yyyy')} · {base}
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={baseTxns.length === 0}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-muted disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </header>

      {/* Range selector */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface/95 p-4 shadow-sm">
        <Select
          value={preset}
          onChange={(e) => setPreset(e.target.value as DatePreset)}
          className="h-11 w-full bg-surface sm:w-56"
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        {preset === 'custom' && (
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-foreground shadow-sm focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-foreground shadow-sm focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            />
          </div>
        )}
      </div>

      {hasOtherCurrency && (
        <p className="rounded-xl border border-border bg-surface-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
          Reports cover your base-currency ({base}) transactions. Multi-currency conversion is coming
          later.
        </p>
      )}

      {isLoading ? (
        <CenterSpinner />
      ) : baseTxns.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-7 w-7" />}
          title="No data for this period"
          description="Log some income or expenses, or widen the date range to see your reports."
        />
      ) : (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Income" value={formatMoney(totals.income, base, { signDisplay: 'never' })} tone="positive" icon={TrendingUp} />
            <Stat label="Expenses" value={formatMoney(totals.expense, base, { signDisplay: 'never' })} tone="negative" icon={TrendingDown} />
            <Stat
              label="Net"
              value={formatMoney(totals.net, base, { signDisplay: 'always' })}
              tone={totals.net >= 0 ? 'positive' : 'negative'}
              icon={Wallet}
            />
            <Stat
              label="Avg / day spend"
              value={formatMoney(Math.round(avgDailySpend), base, { signDisplay: 'never' })}
              tone="neutral"
              icon={BarChart3}
            />
          </div>

          {/* Income vs expense over time */}
          <Card className="p-5">
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Income vs expense
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={timeline} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <Tooltip
                  cursor={{ fill: 'var(--surface-muted)', opacity: 0.5 }}
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [formatMoney(Number(value), base), labelize(String(name))]}
                />
                <Bar dataKey="income" fill="var(--positive)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="expense" fill="var(--negative)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 flex items-center justify-center gap-5 text-xs font-semibold">
              <LegendDot color="var(--positive)" label="Income" />
              <LegendDot color="var(--negative)" label="Expense" />
            </div>
          </Card>

          {/* Category breakdown */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <PieIcon className="h-3.5 w-3.5" />
                {breakdownKind === 'expense' ? 'Spending' : 'Income'} by category
              </p>
              <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs font-semibold">
                {(['expense', 'income'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setBreakdownKind(k)}
                    className={cn(
                      'px-3 py-1.5 transition',
                      breakdownKind === k
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-surface text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {k === 'expense' ? 'Spending' : 'Income'}
                  </button>
                ))}
              </div>
            </div>

            {breakdown.length === 0 ? (
              <EmptyState title="Nothing here" description={`No ${breakdownKind} in this period.`} />
            ) : (
              <div className="grid items-center gap-6 sm:grid-cols-[200px_1fr]">
                <div className="relative mx-auto h-[200px] w-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={breakdown}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={62}
                        outerRadius={92}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {breakdown.map((s) => (
                          <Cell key={s.id} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value, name) => [formatMoney(Number(value), base), String(name)]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Total
                    </span>
                    <span className="font-numeric text-sm font-extrabold text-foreground">
                      {formatMoney(
                        breakdownKind === 'expense' ? totals.expense : totals.income,
                        base,
                        { signDisplay: 'never' },
                      )}
                    </span>
                  </div>
                </div>

                <ul className="space-y-2.5">
                  {breakdown.slice(0, 8).map((s) => (
                    <li key={s.id} className="flex items-center gap-3">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${s.color}20`, color: s.color }}
                      >
                        <CategoryIcon name={s.icon} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">{s.name}</span>
                          <span className="font-numeric text-sm font-bold text-foreground">
                            {formatMoney(s.total, base, { signDisplay: 'never' })}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                            />
                          </div>
                          <span className="w-9 text-right text-[11px] font-semibold text-muted-foreground">
                            {s.pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* Biggest transactions */}
          <Card className="p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Biggest transactions
            </p>
            <ul className="divide-y divide-border">
              {biggest.map((tx) => (
                <BiggestRow key={tx.id} tx={tx} base={base} categoryName={categories.find((c) => c.id === tx.category_id)?.name} />
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  fontSize: 12,
  boxShadow: 'var(--shadow-md)',
} as const

function labelize(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string
  value: string
  tone: 'positive' | 'negative' | 'neutral'
  icon: React.ComponentType<{ className?: string }>
}) {
  const toneCls =
    tone === 'positive'
      ? 'text-positive bg-positive/10'
      : tone === 'negative'
        ? 'text-negative bg-negative/10'
        : 'text-muted-foreground bg-surface-muted'
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', toneCls)}>
        <Icon className="h-5 w-5 stroke-[2.2]" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 truncate font-numeric text-base font-extrabold leading-tight text-foreground">
          {value}
        </p>
      </div>
    </Card>
  )
}

function BiggestRow({
  tx,
  base,
  categoryName,
}: {
  tx: Transaction
  base: string
  categoryName?: string
}) {
  const income = tx.type === 'income'
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {tx.note || categoryName || (income ? 'Income' : 'Expense')}
        </p>
        <p className="text-[11px] font-medium text-muted-foreground">
          {format(new Date(tx.occurred_at), 'd MMM yyyy')}
          {categoryName ? ` · ${categoryName}` : ''}
        </p>
      </div>
      <span className={cn('font-numeric text-sm font-bold', income ? 'text-positive' : 'text-negative')}>
        {income ? '+' : '-'}
        {formatMoney(tx.amount, base, { signDisplay: 'never' })}
      </span>
    </li>
  )
}
