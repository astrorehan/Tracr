import { useMemo, useState } from 'react'
import { eachDayOfInterval, endOfWeek, format, startOfWeek } from 'date-fns'
import {
  Area,
  AreaChart,
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
import {
  BarChart3,
  ChevronRight,
  Download,
  Printer,
  Tag as TagIcon,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Dropdown } from '@/components/ui/Dropdown'
import { PageHeader } from '@/components/ui/list'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { CategoryIcon } from '@/features/categories/CategoryIcon'
import { useAuth } from '@/features/auth/useAuth'
import { useCategories } from '@/features/categories/api'
import { useAccounts, useBalances } from '@/features/accounts/api'
import { useTransactions } from '@/features/transactions/api'
import { useTransactionSplits } from '@/features/transactions/splits'
import { useTags, useTransactionTags } from '@/features/tags/api'
import { useFxRates } from '@/features/fx/api'
import { buildRateTable, convertMinor, rateBetween } from '@/features/fx/fx'
import { indexById } from '@/lib/collections'
import { chartCursor, chartTooltipStyle as tooltipStyle } from '@/lib/chartTheme'
import {
  DATE_PRESETS,
  previousDateRange,
  resolveDateRange,
  type DatePreset,
} from '@/features/transactions/filters'
import {
  bucketByTime,
  categoryTree,
  dailyTotals,
  netWorthSeries,
  payeeBreakdown,
  pctChange,
  periodTotals,
  pickGranularity,
  tagBreakdownForCategory,
  topCategoryId,
  totalsInBase,
  type NetWorthDelta,
} from '@/features/reports/reports'
import { toCsv, downloadTextFile } from '@/lib/csv'
import { AiInsightCard } from '@/features/ai/AiInsightCard'
import { formatMoney, fromMinorUnits } from '@/lib/money'
import { useT } from '@/features/settings/language-context'
import type { MsgKey } from '@/i18n'
import { cn } from '@/lib/utils'
import type { Account, Transaction, TransactionSplit } from '@/types/db'

// Mon-first weekday order + label keys, so the weekday chart reads localized.
const WEEKDAY_KEYS: MsgKey[] = [
  'rep.dow.mon',
  'rep.dow.tue',
  'rep.dow.wed',
  'rep.dow.thu',
  'rep.dow.fri',
  'rep.dow.sat',
  'rep.dow.sun',
]

export function ReportsPage() {
  const { profile } = useAuth()
  const { t } = useT()
  const base = profile?.base_currency ?? 'IDR'

  const [preset, setPreset] = useState<DatePreset>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [breakdownKind, setBreakdownKind] = useState<'expense' | 'income'>('expense')
  const [expandedCat, setExpandedCat] = useState<string | null>(null)

  // Memoized: range resolution reads the clock, which must not happen bare in
  // render. Compare against the same *elapsed* span (clamp the end at now) so a
  // partial current period (e.g. mid-month) isn't measured against a full
  // previous one.
  const { resolved, prevResolved } = useMemo(() => {
    const resolved = resolveDateRange({ datePreset: preset, customFrom, customTo })
    const compareEnd =
      resolved.from && resolved.to
        ? new Date(Math.min(+new Date(resolved.to), +new Date())).toISOString()
        : undefined
    return { resolved, prevResolved: previousDateRange({ from: resolved.from, to: compareEnd }) }
  }, [preset, customFrom, customTo])

  const { data: categories = [] } = useCategories()
  const { data: transactions = [], isLoading } = useTransactions({
    ...resolved,
    limit: 2000,
  })
  // Previous equal-length period (for the vs-prev deltas). Open-ended ranges have
  // no baseline — query a far-future empty window so the hook still has stable input.
  const { data: prevTxns = [] } = useTransactions(
    prevResolved.from
      ? { from: prevResolved.from, to: prevResolved.to, limit: 2000 }
      : { from: '2999-01-01', to: '2999-01-02' },
  )
  const { data: splitsByTx = {} } = useTransactionSplits()
  const { data: tags = [] } = useTags()
  const { data: tagsByTx = {} } = useTransactionTags()
  const { data: fxRates = [] } = useFxRates()
  const { data: accounts = [] } = useAccounts()
  const { data: balances = {} } = useBalances()
  // History from the range start (no upper bound) so we can value net worth at each
  // boundary by removing movements that came after it — incl. those past `to`.
  const { data: historyTxns = [] } = useTransactions({ from: resolved.from, limit: 5000 })

  // Value every (non-transfer) transaction in the base currency: use the frozen
  // per-transaction snapshot when present (accurate history), otherwise convert
  // at the latest known rate. Split amounts are scaled by the same ratio so the
  // category breakdown stays consistent. Transactions we can't value (no rate)
  // are reported back so we can prompt the user instead of silently dropping them.
  const { baseTxns, scaledSplits, skipped } = useMemo(() => {
    const table = buildRateTable(fxRates, base)
    const out: Transaction[] = []
    const splits: Record<string, TransactionSplit[]> = {}
    const skip = new Set<string>()
    for (const tx of transactions) {
      if (tx.type === 'transfer') continue
      const bv =
        tx.base_amount != null ? tx.base_amount : convertMinor(tx.amount, tx.currency, base, table)
      if (bv == null) {
        skip.add(tx.currency)
        continue
      }
      out.push({ ...tx, amount: bv, currency: base })
      const s = splitsByTx[tx.id]
      if (s) {
        splits[tx.id] =
          tx.amount > 0 && bv !== tx.amount
            ? s.map((sp) => ({ ...sp, amount: Math.round((sp.amount * bv) / tx.amount) }))
            : s
      }
    }
    return { baseTxns: out, scaledSplits: splits, skipped: [...skip] }
  }, [transactions, base, fxRates, splitsByTx])

  const totals = useMemo(() => periodTotals(baseTxns), [baseTxns])
  const prevTotals = useMemo(() => totalsInBase(prevTxns, base, fxRates), [prevTxns, base, fxRates])
  const hasComparison = !!prevResolved.from

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

  // Net worth over time, valued at latest rates (endpoint == dashboard net worth).
  // Mirrors how the dashboard nets accounts: skips archived (via useAccounts) and
  // exclude_from_stats; liabilities run negative so they subtract automatically.
  const netWorth = useMemo(() => {
    const table = buildRateTable(fxRates, base)
    const acctById = indexById(accounts)
    const counts = (a: Account | undefined): a is Account =>
      !!a && !a.exclude_from_stats && rateBetween(a.currency, base, table) != null
    const valueOf = (minor: number, currency: string) => convertMinor(minor, currency, base, table) ?? 0

    const nwNow = accounts.reduce(
      (s, a) => (counts(a) ? s + valueOf(balances[a.id] ?? a.opening_balance, a.currency) : s),
      0,
    )

    const deltas: NetWorthDelta[] = []
    for (const tx of historyTxns) {
      const a = acctById[tx.account_id]
      let d = 0
      if (tx.type === 'income') {
        if (counts(a)) d += valueOf(tx.amount, a.currency)
      } else if (tx.type === 'expense') {
        if (counts(a)) d -= valueOf(tx.amount, a.currency)
      } else {
        if (counts(a)) d -= valueOf(tx.amount, a.currency)
        const b = tx.counter_account_id ? acctById[tx.counter_account_id] : undefined
        if (counts(b)) d += valueOf(tx.counter_amount ?? tx.amount, b.currency)
      }
      if (d !== 0) deltas.push({ t: +new Date(tx.occurred_at), d })
    }

    const series = netWorthSeries(nwNow, deltas, from, to, pickGranularity(from, to))
    const change = series.length ? series[series.length - 1].value - series[0].value : 0
    return { series, nwNow, change }
  }, [accounts, balances, historyTxns, fxRates, base, from, to])

  const breakdown = useMemo(
    () => categoryTree(baseTxns, categories, breakdownKind, scaledSplits),
    [baseTxns, categories, breakdownKind, scaledSplits],
  )

  // Tags used within the expanded category — the tag half of the drill-down.
  const drillTags = useMemo(
    () =>
      expandedCat
        ? tagBreakdownForCategory(baseTxns, expandedCat, breakdownKind, categories, tags, tagsByTx)
        : [],
    [expandedCat, baseTxns, breakdownKind, categories, tags, tagsByTx],
  )

  // Top categories that have at least one tagged transaction of the current kind —
  // so a row without subcategories can still be drilled into by tag.
  const catsWithTags = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c.id, c]))
    const set = new Set<string>()
    for (const tx of baseTxns) {
      if (tx.type !== breakdownKind || !tagsByTx[tx.id]?.length) continue
      set.add(topCategoryId(tx.category_id, catMap) ?? '__uncat')
    }
    return set
  }, [baseTxns, breakdownKind, categories, tagsByTx])

  // Daily spend grid (always spending — the most useful calendar view).
  const heatmap = useMemo(() => dailyTotals(baseTxns, 'expense'), [baseTxns])

  // Spending by weekday over the range — which days cost the most (moved here
  // from the home screen, which is now chart-free).
  const weekday = useMemo(() => {
    const sums = [0, 0, 0, 0, 0, 0, 0] // JS getDay(): 0=Sun … 6=Sat
    for (const tx of baseTxns) {
      if (tx.type !== 'expense') continue
      sums[new Date(tx.occurred_at).getDay()] += tx.amount
    }
    const order = [1, 2, 3, 4, 5, 6, 0]
    return order.map((d, i) => ({ label: t(WEEKDAY_KEYS[i]), total: sums[d] }))
  }, [baseTxns, t])

  const biggest = useMemo(
    () => [...baseTxns].sort((a, b) => b.amount - a.amount).slice(0, 8),
    [baseTxns],
  )

  const topPayees = useMemo(
    () => payeeBreakdown(baseTxns, breakdownKind).slice(0, 8),
    [baseTxns, breakdownKind],
  )

  // Average over days elapsed so far (cap the end at today), not the whole period —
  // spending Rp3m on the 1st reads as Rp3m/day, then Rp1.5m/day on the 2nd, etc.
  const avgDailySpend = useMemo(() => {
    const elapsedEnd = Math.min(+to, +now)
    const dayCount = Math.max(1, Math.floor((elapsedEnd - +from) / 86_400_000) + 1)
    return totals.expense / dayCount
  }, [from, to, now, totals.expense])

  // Avg/day for the previous period spreads over its full length (it's fully elapsed).
  const prevAvgDaily = useMemo(() => {
    if (!prevResolved.from || !prevResolved.to) return 0
    const days = Math.max(1, Math.round((+new Date(prevResolved.to) - +new Date(prevResolved.from)) / 86_400_000))
    return prevTotals.expense / days
  }, [prevResolved.from, prevResolved.to, prevTotals.expense])

  function exportCsv() {
    const rows: (string | number)[][] = [
      [t('rep.csvReport'), t(breakdownKind === 'expense' ? 'rep.csvReportExpense' : 'rep.csvReportIncome')],
      [
        t('rep.csvPeriod'),
        t('rep.csvPeriodValue', { from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') }),
      ],
      [t('rep.csvCurrency'), base],
      [],
      [t('common.category'), t('common.amount'), t('rep.csvShare')],
      ...breakdown.map((s) => [s.name, fromMinorUnits(s.total, base), s.pct.toFixed(1)]),
      ...(topPayees.length > 0
        ? ([
            [],
            [
              t(breakdownKind === 'expense' ? 'rep.topPayees' : 'rep.topSources'),
              t('common.amount'),
              t('rep.csvCount'),
            ],
            ...topPayees.map((p) => [p.name, fromMinorUnits(p.total, base), p.count]),
          ] as (string | number)[][])
        : []),
      [],
      [t('rep.csvTotalIncome'), fromMinorUnits(totals.income, base)],
      [t('rep.csvTotalExpense'), fromMinorUnits(totals.expense, base)],
      [t('rep.statNet'), fromMinorUnits(totals.net, base)],
    ]
    downloadTextFile(`tracr-report-${format(new Date(), 'yyyyMMdd')}.csv`, toCsv(rows))
  }

  // Presets/labels are language-aware; resolve them here so the dropdown stays
  // in sync with the active locale.
  const presetOptions = useMemo(
    () => DATE_PRESETS.map((p) => ({ value: p.value, label: t(p.labelKey) })),
    [t],
  )

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={t('nav.reports')}
        subtitle={`${format(from, 'd MMM yyyy')} – ${format(to, 'd MMM yyyy')} · ${base}`}
        action={
          <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={baseTxns.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-muted disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">{t('rep.print')}</span>
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={baseTxns.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{t('rep.exportCsv')}</span>
          </button>
          </div>
        }
      />

      {/* Range selector */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm print:hidden">
        <Dropdown
          value={preset}
          onChange={setPreset}
          options={presetOptions}
          aria-label={t('rep.dateRangeAria')}
          className="w-full sm:w-56"
        />
        {preset === 'custom' && (
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-foreground shadow-sm focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            />
            <span className="text-sm text-muted-foreground">{t('rep.rangeTo')}</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-foreground shadow-sm focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            />
          </div>
        )}
      </div>

      {/* AI read of the current month */}
      <AiInsightCard />

      {skipped.length > 0 && (
        <p className="rounded-xl border border-border bg-surface-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
          {t('rep.skippedNotice', { codes: skipped.join(', '), base })}
        </p>
      )}

      {isLoading ? (
        <CenterSpinner />
      ) : baseTxns.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-7 w-7" />}
          title={t('rep.emptyTitle')}
          description={t('rep.emptyDesc')}
        />
      ) : (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label={t('common.income')}
              value={formatMoney(totals.income, base, { signDisplay: 'never' })}
              tone="positive"
              icon={TrendingUp}
              delta={hasComparison ? deltaFor(totals.income, prevTotals.income, true) : undefined}
            />
            <Stat
              label={t('common.expense')}
              value={formatMoney(totals.expense, base, { signDisplay: 'never' })}
              tone="negative"
              icon={TrendingDown}
              delta={hasComparison ? deltaFor(totals.expense, prevTotals.expense, false) : undefined}
            />
            <Stat
              label={t('rep.statNet')}
              value={formatMoney(totals.net, base, { signDisplay: 'always' })}
              tone={totals.net >= 0 ? 'positive' : 'negative'}
              icon={Wallet}
              delta={hasComparison ? deltaFor(totals.net, prevTotals.net, true) : undefined}
            />
            <Stat
              label={t('rep.statAvgDay')}
              value={formatMoney(Math.round(avgDailySpend), base, { signDisplay: 'never' })}
              tone="neutral"
              icon={BarChart3}
              delta={hasComparison ? deltaFor(avgDailySpend, prevAvgDaily, false) : undefined}
            />
          </div>

          {/* Net worth over time */}
          <Card className="p-5">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h2 className="section-head text-[17px] text-foreground">{t('rep.netWorthTitle')}</h2>
              <span className="font-numeric text-sm font-extrabold text-foreground">
                {formatMoney(netWorth.nwNow, base)}
              </span>
            </div>
            <p
              className={cn(
                'mb-3 text-xs font-bold',
                netWorth.change >= 0 ? 'text-positive' : 'text-negative',
              )}
            >
              {netWorth.change >= 0 ? '▲' : '▼'}{' '}
              {formatMoney(netWorth.change, base, { signDisplay: 'always' })} {t('rep.overThisPeriod')}
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={netWorth.series} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [formatMoney(Number(value), base), t('rep.netWorth')]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#nwGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Income vs expense over time */}
          <Card className="p-5">
            <h2 className="section-head mb-4 text-[17px] text-foreground">{t('rep.inVsOut')}</h2>
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
                  cursor={chartCursor}
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [
                    formatMoney(Number(value), base),
                    t(name === 'income' ? 'common.income' : 'common.expense'),
                  ]}
                />
                <Bar dataKey="income" fill="var(--positive)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="expense" fill="var(--negative)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 flex items-center justify-center gap-5 text-xs font-semibold">
              <LegendDot color="var(--positive)" label={t('common.income')} />
              <LegendDot color="var(--negative)" label={t('common.expense')} />
            </div>
          </Card>

          {/* Spending calendar (daily heatmap) */}
          <Card className="p-5">
            <h2 className="section-head mb-4 text-[17px] text-foreground">{t('rep.calendarTitle')}</h2>
            <CalendarHeatmap data={heatmap} from={from} to={to} base={base} />
          </Card>

          {/* Spending by weekday */}
          <Card className="p-5">
            <h2 className="section-head mb-4 text-[17px] text-foreground">{t('rep.weekdayTitle')}</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekday} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
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
                  contentStyle={tooltipStyle}
                  formatter={(value) => [formatMoney(Number(value), base), t('rep.spent')]}
                />
                <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Category breakdown */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="section-head text-[17px] text-foreground">
                {t(breakdownKind === 'expense' ? 'rep.byCategoryExpense' : 'rep.byCategoryIncome')}
              </h2>
              <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs font-semibold">
                {(['expense', 'income'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setBreakdownKind(k)
                      setExpandedCat(null)
                    }}
                    className={cn(
                      'px-3 py-1.5 transition',
                      breakdownKind === k
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-surface text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(k === 'expense' ? 'common.expense' : 'common.income')}
                  </button>
                ))}
              </div>
            </div>

            {breakdown.length === 0 ? (
              <EmptyState
                title={t('rep.nothingHere')}
                description={t(
                  breakdownKind === 'expense' ? 'rep.noneExpenseInPeriod' : 'rep.noneIncomeInPeriod',
                )}
              />
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
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t('rep.total')}
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

                <ul className="space-y-1">
                  {breakdown.slice(0, 8).map((s) => {
                    const drillable = s.children.length > 0 || catsWithTags.has(s.id)
                    const open = expandedCat === s.id
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          disabled={!drillable}
                          onClick={() => setExpandedCat(open ? null : s.id)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-left transition',
                            drillable ? 'hover:bg-surface-muted' : 'cursor-default',
                          )}
                          aria-expanded={drillable ? open : undefined}
                        >
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
                              <span className="w-9 text-right text-xs font-semibold text-muted-foreground">
                                {s.pct.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <ChevronRight
                            className={cn(
                              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                              !drillable && 'invisible',
                              open && 'rotate-90',
                            )}
                          />
                        </button>

                        {open && (
                          <div className="ml-11 mt-1 mb-2 space-y-3 border-l border-border pl-3">
                            {s.children.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                  {t('rep.subcategories')}
                                </p>
                                {s.children.map((c) => (
                                  <DrillBar key={c.id} label={c.name} value={c.total} pct={c.pct} color={c.color} base={base} />
                                ))}
                              </div>
                            )}
                            {drillTags.length > 0 && (
                              <div className="space-y-2">
                                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                  <TagIcon className="h-3 w-3" /> {t('section.tags')}
                                </p>
                                {drillTags.map((tag) => (
                                  <DrillBar key={tag.id} label={tag.name} value={tag.total} pct={tag.pct} color={tag.color} base={base} />
                                ))}
                              </div>
                            )}
                            {s.children.length === 0 && drillTags.length === 0 && (
                              <p className="text-xs text-muted-foreground">{t('rep.noDrill')}</p>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </Card>

          {/* Biggest transactions */}
          <Card className="p-5">
            <h2 className="section-head mb-3 text-[17px] text-foreground">{t('rep.biggest')}</h2>
            <ul className="divide-y divide-border">
              {biggest.map((tx) => (
                <BiggestRow key={tx.id} tx={tx} base={base} categoryName={categories.find((c) => c.id === tx.category_id)?.name} />
              ))}
            </ul>
          </Card>

          {/* Top payees */}
          {topPayees.length > 0 && (
            <Card className="p-5">
              <h2 className="section-head mb-3 text-[17px] text-foreground">
                {t(breakdownKind === 'expense' ? 'rep.topPayees' : 'rep.topSources')}
              </h2>
              <ul className="space-y-2.5">
                {topPayees.map((p) => (
                  <li key={p.name} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">{p.name}</span>
                        <span className="font-numeric text-sm font-bold text-foreground">
                          {formatMoney(p.total, base, { signDisplay: 'never' })}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${p.pct}%` }}
                          />
                        </div>
                        <span className="w-16 text-right text-xs font-semibold text-muted-foreground">
                          {p.count}×
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

interface Delta {
  pct: number
  /** Whether this direction of change is good (drives the color). */
  good: boolean
}

/** Build a vs-previous delta, or undefined when there's no comparable baseline. */
function deltaFor(cur: number, prev: number, higherIsBetter: boolean): Delta | undefined {
  const pct = pctChange(cur, prev)
  if (pct == null) return undefined
  return { pct, good: higherIsBetter ? pct >= 0 : pct <= 0 }
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
  delta,
}: {
  label: string
  value: string
  tone: 'positive' | 'negative' | 'neutral'
  icon: React.ComponentType<{ className?: string }>
  delta?: Delta
}) {
  const { t } = useT()
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
        <p className="truncate text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 truncate font-numeric text-base font-extrabold leading-tight text-foreground">
          {value}
        </p>
        {delta && (
          <p
            className={cn(
              'mt-0.5 flex items-center gap-1 text-xs font-bold',
              delta.good ? 'text-positive' : 'text-negative',
            )}
          >
            <span>
              {delta.pct >= 0 ? '▲' : '▼'} {Math.abs(delta.pct).toFixed(0)}%
            </span>
            <span className="font-medium text-muted-foreground">{t('rep.vsPrev')}</span>
          </p>
        )}
      </div>
    </Card>
  )
}

/** A labelled progress bar used in the category drill-down (subcategories / tags). */
function DrillBar({
  label,
  value,
  pct,
  color,
  base,
}: {
  label: string
  value: number
  pct: number
  color: string
  base: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-semibold text-foreground">{label}</span>
          <span className="font-numeric text-xs font-bold text-foreground">
            {formatMoney(value, base, { signDisplay: 'never' })}
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>
    </div>
  )
}

const HEAT_LEVELS = [0.16, 0.4, 0.62, 0.85, 1] // opacity steps, low→high spend

/**
 * GitHub-style daily-spend grid: weeks as columns, Mon→Sun as rows, each cell
 * shaded by that day's spend relative to the period's busiest day.
 */
function CalendarHeatmap({
  data,
  from,
  to,
  base,
}: {
  data: Map<string, number>
  from: Date
  to: Date
  base: string
}) {
  const { t } = useT()
  const { weeks, max, fromKey, toKey } = useMemo(() => {
    const start = startOfWeek(from, { weekStartsOn: 1 })
    const end = endOfWeek(to, { weekStartsOn: 1 })
    const days = eachDayOfInterval({ start, end })
    const cols: Date[][] = []
    for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7))
    return {
      weeks: cols,
      max: Math.max(1, ...data.values()),
      fromKey: format(from, 'yyyy-MM-dd'),
      toKey: format(to, 'yyyy-MM-dd'),
    }
  }, [data, from, to])

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {/* Weekday labels */}
      <div className="mt-[18px] flex shrink-0 flex-col gap-[3px] pr-1 text-xs font-semibold text-muted-foreground">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="flex h-[13px] items-center leading-none">
            {i % 2 === 0 ? d : ''}
          </span>
        ))}
      </div>

      <div className="min-w-0">
        {/* Month labels above each week column */}
        <div className="mb-1 flex gap-[3px]">
          {weeks.map((week, i) => (
            <span key={i} className="w-[13px] text-xs font-semibold text-muted-foreground">
              {week[0].getDate() <= 7 ? format(week[0], 'MMM') : ''}
            </span>
          ))}
        </div>

        <div className="flex gap-[3px]">
          {weeks.map((week, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {week.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const inRange = key >= fromKey && key <= toKey
                const value = data.get(key) ?? 0
                const level = value > 0 ? HEAT_LEVELS[Math.min(4, Math.ceil((value / max) * 5) - 1)] : 0
                return (
                  <div
                    key={key}
                    title={inRange ? `${format(day, 'd MMM yyyy')}: ${formatMoney(value, base, { signDisplay: 'never' })}` : undefined}
                    className={cn('h-[13px] w-[13px] rounded-[3px]', !inRange && 'opacity-0')}
                    style={{
                      backgroundColor: value > 0 ? 'var(--primary)' : 'var(--surface-muted)',
                      opacity: !inRange ? 0 : value > 0 ? level : 1,
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <span>{t('rep.less')}</span>
          <span className="h-[11px] w-[11px] rounded-[3px]" style={{ backgroundColor: 'var(--surface-muted)' }} />
          {HEAT_LEVELS.map((o) => (
            <span key={o} className="h-[11px] w-[11px] rounded-[3px]" style={{ backgroundColor: 'var(--primary)', opacity: o }} />
          ))}
          <span>{t('rep.more')}</span>
        </div>
      </div>
    </div>
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
  const { t } = useT()
  const income = tx.type === 'income'
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {tx.note || categoryName || t(income ? 'common.income' : 'common.expense')}
        </p>
        <p className="text-xs font-medium text-muted-foreground">
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
