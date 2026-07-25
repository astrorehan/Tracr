import { useMemo, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { endOfMonth, format } from 'date-fns'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  Minus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Sparkline } from '@/components/ui/Sparkline'
import { useT } from '@/features/settings/language-context'
import { dateLocale } from '@/i18n'
import { formatMoney, formatMoneyCompact } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  categoryTree,
  dailyTotals,
  pctChange,
  type PeriodTotals,
  type TimeBucket,
} from './reports'
import type { DatePreset, TxFilter } from '@/features/transactions/filters'
import type { Category, Transaction, TransactionSplit } from '@/types/db'

export type StatMetric = 'income' | 'expense' | 'net' | 'avgday'

interface Delta {
  pct: number
  /** Whether this direction of change is the good one (drives the color). */
  good: boolean
}

interface Props {
  base: string
  /** Resolved range bounds of the report. */
  from: Date
  to: Date
  /** The equal-length window before `from`, when one exists. */
  prevRange: { from?: string; to?: string }
  totals: PeriodTotals
  prevTotals: PeriodTotals
  avgDaily: number
  prevAvgDaily: number
  /** Days elapsed so far (the avg/day divisor) and the range's full length. */
  daysElapsed: number
  daysTotal: number
  timeline: TimeBucket[]
  /** Base-valued, transfer-free transactions of the current range. */
  txns: Transaction[]
  categories: Category[]
  splits: Record<string, TransactionSplit[]>
  /** Passed through to the Activity page when drilling into a tile. */
  dateFilter: { datePreset: DatePreset; customFrom: string; customTo: string }
}

interface TileSpec {
  id: StatMetric
  label: string
  value: number
  prevValue: number
  color: string
  icon: ComponentType<{ className?: string }>
  series: number[]
  delta?: Delta
  signDisplay: 'never' | 'always'
}

/** Build a vs-previous delta, or undefined when there's no comparable baseline. */
function deltaFor(cur: number, prev: number, higherIsBetter: boolean): Delta | undefined {
  const pct = pctChange(cur, prev)
  if (pct == null) return undefined
  return { pct, good: higherIsBetter ? pct >= 0 : pct <= 0 }
}

/**
 * The four headline numbers of a report, each a pressable tile: label, the
 * amount, how it moved against the previous period, and a trend line. Tapping
 * one opens a sheet that explains the number in plain words and links through
 * to the transactions behind it.
 */
export function StatTiles({
  base,
  from,
  to,
  prevRange,
  totals,
  prevTotals,
  avgDaily,
  prevAvgDaily,
  daysElapsed,
  daysTotal,
  timeline,
  txns,
  categories,
  splits,
  dateFilter,
}: Props) {
  const { t } = useT()
  const [open, setOpen] = useState<StatMetric | null>(null)

  const series = useMemo(() => {
    const income: number[] = []
    const expense: number[] = []
    const net: number[] = [] // accumulates — net reads as a trajectory, not a per-bucket wobble
    const avgday: number[] = [] // spend-to-date over days elapsed at each bucket's end, so a
    // monthly-bucketed range still plots a per-day figure rather than a per-month one
    let netRunning = 0
    let spent = 0
    for (const b of timeline) {
      income.push(b.income)
      expense.push(b.expense)
      netRunning += b.net
      net.push(netRunning)
      spent += b.expense
      const bucketEnd =
        b.key.length > 7 ? new Date(`${b.key}T23:59:59`) : endOfMonth(new Date(`${b.key}-01T00:00:00`))
      const days = Math.max(1, Math.floor((Math.min(+bucketEnd, +to) - +from) / 86_400_000) + 1)
      avgday.push(spent / days)
    }
    return { income, expense, net, avgday }
  }, [timeline, from, to])

  const tiles: TileSpec[] = [
    {
      id: 'income',
      label: t('common.income'),
      value: totals.income,
      prevValue: prevTotals.income,
      color: 'var(--positive)',
      icon: TrendingUp,
      series: series.income,
      delta: prevRange.from ? deltaFor(totals.income, prevTotals.income, true) : undefined,
      signDisplay: 'never',
    },
    {
      id: 'expense',
      label: t('common.expense'),
      value: totals.expense,
      prevValue: prevTotals.expense,
      color: 'var(--negative)',
      icon: TrendingDown,
      series: series.expense,
      delta: prevRange.from ? deltaFor(totals.expense, prevTotals.expense, false) : undefined,
      signDisplay: 'never',
    },
    {
      id: 'net',
      label: t('rep.statNet'),
      value: totals.net,
      prevValue: prevTotals.net,
      color: totals.net >= 0 ? 'var(--positive)' : 'var(--negative)',
      icon: Wallet,
      series: series.net,
      delta: prevRange.from ? deltaFor(totals.net, prevTotals.net, true) : undefined,
      signDisplay: 'always',
    },
    {
      id: 'avgday',
      label: t('rep.statAvgDay'),
      value: Math.round(avgDaily),
      prevValue: Math.round(prevAvgDaily),
      color: 'var(--primary)',
      icon: BarChart3,
      series: series.avgday,
      delta: prevRange.from ? deltaFor(avgDaily, prevAvgDaily, false) : undefined,
      signDisplay: 'never',
    },
  ]

  const active = tiles.find((tile) => tile.id === open)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Tile key={tile.id} tile={tile} base={base} onOpen={() => setOpen(tile.id)} />
        ))}
      </div>

      {active && (
        <StatDetailSheet
          tile={active}
          base={base}
          from={from}
          to={to}
          prevRange={prevRange}
          totals={totals}
          daysElapsed={daysElapsed}
          daysTotal={daysTotal}
          avgDaily={avgDaily}
          labels={timeline.map((b) => b.label)}
          txns={txns}
          categories={categories}
          splits={splits}
          dateFilter={dateFilter}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

function Tile({ tile, base, onOpen }: { tile: TileSpec; base: string; onOpen: () => void }) {
  const { t } = useT()
  const Icon = tile.icon
  const full = formatMoney(tile.value, base, { signDisplay: tile.signDisplay })
  // Only shorten when the exact number would overflow a half-width tile —
  // precision is worth more than the saved characters when it fits.
  const shown =
    full.length > 12 ? formatMoneyCompact(tile.value, base, { signDisplay: tile.signDisplay }) : full

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${tile.label}: ${full}. ${t('rep.tapForDetail')}`}
      // Transitioning border-color here would strand the tile on the old theme's
      // border when the light/dark tokens swap, so only transform/shadow animate.
      className="card-surface group relative flex flex-col overflow-hidden rounded-[20px] p-4 pb-0 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span className="flex items-center gap-1.5">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `color-mix(in oklab, ${tile.color} 14%, transparent)`, color: tile.color }}
        >
          <Icon className="h-3.5 w-3.5 stroke-[2.4]" />
        </span>
        <span className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {tile.label}
        </span>
        {/* Two-up tiles have no room for it on a phone, where the whole tile is
            the tap target anyway — the hint is for pointer users. */}
        <ChevronRight className="ml-auto hidden h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary sm:block" />
      </span>

      <span
        className="mt-2.5 block whitespace-nowrap font-numeric text-[19px] font-extrabold leading-none tracking-tight text-foreground sm:text-[22px]"
        title={full}
      >
        {shown}
      </span>

      {/* Reserved height keeps the four tiles aligned when one has no baseline. */}
      <span className="mt-2 flex min-h-[20px] items-center gap-1.5">
        {tile.delta && <DeltaPill delta={tile.delta} />}
      </span>

      <Sparkline values={tile.series} color={tile.color} height={30} className="-mx-4 mt-2" />
    </button>
  )
}

function DeltaPill({ delta }: { delta: Delta }) {
  const { t } = useT()
  const Icon = delta.pct > 0 ? ArrowUpRight : delta.pct < 0 ? ArrowDownRight : Minus
  const pct = Math.abs(delta.pct)
  return (
    <>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-extrabold',
          delta.good ? 'bg-positive/12 text-positive' : 'bg-negative/12 text-negative',
        )}
      >
        <Icon className="h-3 w-3 stroke-[2.6]" />
        {pct >= 999 ? '999+' : pct.toFixed(0)}%
      </span>
      <span className="truncate text-[10px] font-semibold text-muted-foreground">{t('rep.vsPrev')}</span>
    </>
  )
}

/** Which transaction type a tile drills into on the Activity page. */
const DRILL_TYPE: Record<StatMetric, TxFilter['type']> = {
  income: 'income',
  expense: 'expense',
  net: '',
  avgday: 'expense',
}

function StatDetailSheet({
  tile,
  base,
  from,
  to,
  prevRange,
  totals,
  daysElapsed,
  daysTotal,
  avgDaily,
  labels,
  txns,
  categories,
  splits,
  dateFilter,
  onClose,
}: {
  tile: TileSpec
  base: string
  from: Date
  to: Date
  prevRange: { from?: string; to?: string }
  totals: PeriodTotals
  daysElapsed: number
  daysTotal: number
  avgDaily: number
  labels: string[]
  txns: Transaction[]
  categories: Category[]
  splits: Record<string, TransactionSplit[]>
  dateFilter: { datePreset: DatePreset; customFrom: string; customTo: string }
  onClose: () => void
}) {
  const { t } = useT()
  const navigate = useNavigate()
  const money = (v: number, signDisplay: 'never' | 'always' = 'never') =>
    formatMoney(Math.round(v), base, { signDisplay })
  const day = (d: Date | string) => format(new Date(d), 'd MMM yyyy', { locale: dateLocale() })

  const kind = tile.id === 'income' ? 'income' : 'expense'
  const kindTxns = useMemo(() => txns.filter((tx) => tx.type === kind), [txns, kind])
  const topCategory = useMemo(
    () => categoryTree(txns, categories, kind, splits)[0],
    [txns, categories, kind, splits],
  )
  const biggestTx = useMemo(
    () => kindTxns.reduce<Transaction | null>((best, tx) => (!best || tx.amount > best.amount ? tx : best), null),
    [kindTxns],
  )
  const spendByDay = useMemo(() => dailyTotals(txns, 'expense'), [txns])
  const priciestDay = useMemo(() => {
    let best: { key: string; total: number } | null = null
    for (const [key, total] of spendByDay) if (!best || total > best.total) best = { key, total }
    return best
  }, [spendByDay])

  const facts: { label: string; value: string; sub?: string }[] = []
  if (tile.id === 'income' || tile.id === 'expense') {
    facts.push({ label: t('rep.txCount'), value: `${kindTxns.length}×` })
    if (kindTxns.length > 0)
      facts.push({ label: t('rep.avgPerTx'), value: money(tile.value / kindTxns.length) })
    if (topCategory)
      facts.push({
        label: t('rep.topCategory'),
        value: money(topCategory.total),
        sub: `${topCategory.name} · ${topCategory.pct.toFixed(0)}%`,
      })
    if (biggestTx)
      facts.push({
        label: t('rep.biggestOne'),
        value: money(biggestTx.amount),
        sub: [biggestTx.payee || biggestTx.note, day(biggestTx.occurred_at)].filter(Boolean).join(' · '),
      })
  } else if (tile.id === 'net') {
    facts.push({ label: t('rep.moneyIn'), value: money(totals.income) })
    facts.push({ label: t('rep.moneyOut'), value: money(totals.expense) })
    if (totals.income > 0)
      facts.push({
        label: t('rep.keptPct'),
        value: `${Math.round((totals.net / totals.income) * 100)}%`,
        sub: t('rep.keptPctHint'),
      })
  } else {
    facts.push({ label: t('rep.daysCounted'), value: t('rep.daysUnit', { n: daysElapsed }) })
    if (priciestDay)
      facts.push({
        label: t('rep.priciestDay'),
        value: money(priciestDay.total),
        sub: day(priciestDay.key),
      })
    facts.push({
      label: t('rep.zeroDays'),
      value: t('rep.daysUnit', { n: Math.max(0, daysElapsed - spendByDay.size) }),
    })
    if (daysTotal > daysElapsed)
      facts.push({
        label: t('rep.projected'),
        value: money(avgDaily * daysTotal),
        sub: t('rep.projectedHint', { date: day(to) }),
      })
  }

  const diff = tile.value - tile.prevValue
  const changeLine =
    diff === 0
      ? t('rep.changeSame')
      : t(diff > 0 ? 'rep.changeMore' : 'rep.changeLess', { amount: money(Math.abs(diff)) })

  return (
    <Modal
      open
      onClose={onClose}
      title={tile.label}
      description={`${day(from)} – ${day(to)}`}
      footer={
        <Button
          className="w-full"
          onClick={() =>
            navigate('/transactions', {
              state: {
                filter: {
                  type: DRILL_TYPE[tile.id],
                  datePreset: dateFilter.datePreset,
                  customFrom: dateFilter.customFrom,
                  customTo: dateFilter.customTo,
                  sort: 'amount_desc',
                } satisfies Partial<TxFilter>,
              },
            })
          }
        >
          {t('rep.seeTransactions')}
          <ChevronRight className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-5">
        {/* The exact number — never shortened, never clipped. */}
        <div>
          <p
            className="font-numeric text-[30px] font-extrabold leading-none tracking-tight"
            style={{ color: tile.color }}
          >
            {formatMoney(tile.value, base, { signDisplay: tile.signDisplay })}
          </p>
          <p className="mt-2 text-sm leading-snug text-muted-foreground">{t(EXPLAIN[tile.id])}</p>
        </div>

        {/* vs the previous, equal-length period */}
        <div className="rounded-2xl border border-border bg-surface-muted/40 p-4">
          {prevRange.from && prevRange.to ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-muted-foreground">{t('rep.prevPeriod')}</span>
                <span className="font-numeric text-sm font-bold text-foreground">
                  {formatMoney(tile.prevValue, base, { signDisplay: tile.signDisplay })}
                </span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                {day(prevRange.from)} – {day(prevRange.to)}
              </p>
              <p
                className={cn(
                  'mt-2.5 flex items-center gap-1.5 text-sm font-bold',
                  !tile.delta
                    ? 'text-foreground'
                    : tile.delta.good
                      ? 'text-positive'
                      : 'text-negative',
                )}
              >
                {diff !== 0 &&
                  (diff > 0 ? (
                    <ArrowUpRight className="h-4 w-4 shrink-0 stroke-[2.6]" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 shrink-0 stroke-[2.6]" />
                  ))}
                {changeLine}
              </p>
            </>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">{t('rep.noBaseline')}</p>
          )}
        </div>

        {/* How it moved across the period */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('rep.trendLabel')}
          </p>
          <Sparkline values={tile.series} color={tile.color} height={120} endDot className="mt-3" />
          <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>{labels[0]}</span>
            <span>{labels[labels.length - 1]}</span>
          </div>
        </div>

        {facts.length > 0 && (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {facts.map((f) => (
              <li key={f.label} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{f.label}</p>
                  {f.sub && <p className="truncate text-xs font-medium text-muted-foreground">{f.sub}</p>}
                </div>
                <span className="shrink-0 font-numeric text-sm font-bold text-foreground">{f.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

const EXPLAIN = {
  income: 'rep.explainIncome',
  expense: 'rep.explainExpense',
  net: 'rep.explainNet',
  avgday: 'rep.explainAvgDay',
} as const
