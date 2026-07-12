import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { format, subMonths } from 'date-fns'
import {
  Wallet,
  Plus,
  Target,
  PiggyBank,
  Receipt,
  BarChart3,
  Eye,
  EyeOff,
  type LucideProps,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { EmptyState, Skeleton } from '@/components/ui/States'
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
import { TransactionForm } from '@/features/transactions/TransactionForm'
import { indexById } from '@/lib/collections'
import { cn } from '@/lib/utils'

type IconType = ComponentType<LucideProps>

/** Quick-action tiles. Chip accents are the only place color lives on the home. */
const CHIP: Record<string, string> = {
  blue: 'bg-chip-blue-bg text-chip-blue-fg',
  green: 'bg-chip-green-bg text-chip-green-fg',
  orange: 'bg-chip-orange-bg text-chip-orange-fg',
  violet: 'bg-chip-violet-bg text-chip-violet-fg',
}

export function DashboardPage() {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'

  const [addOpen, setAddOpen] = useState(false)
  const [hidden, setHidden] = useHiddenBalance()

  const { data: accounts = [], isLoading: la } = useAccounts()
  const { data: balances = {}, isLoading: lb } = useBalances()
  const { data: categories = [] } = useCategories()
  const { data: transactions = [], isLoading: lt } = useTransactions({ limit: 500 })
  const { data: fxRates = [] } = useFxRates()

  const accountMap = useMemo(() => indexById(accounts), [accounts])
  const categoryMap = useMemo(() => indexById(categories), [categories])

  // Totals grouped by currency (source of truth, shown per currency as chips).
  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const a of accounts) {
      if (a.exclude_from_stats) continue
      totals[a.currency] = (totals[a.currency] ?? 0) + (balances[a.id] ?? a.opening_balance)
    }
    return totals
  }, [accounts, balances])

  // All money, converted to the base currency at the latest known rates (display
  // only). Tracks currencies we can't convert so we prompt for a rate instead of
  // showing a wrong total.
  const money = useMemo(() => {
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

  // This month's in/out/kept in base currency, with last month as the baseline
  // for the ▲/▼ vs-last-month chips.
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

  const recent = transactions.slice(0, 6)
  const otherCurrencies = Object.entries(totalsByCurrency).filter(([c]) => c !== base)
  const symbol = getCurrency(base).symbol
  const loading = la || lb || lt

  if (loading) return <DashboardSkeleton />

  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={<Wallet className="h-7 w-7" />}
          title="Let's set up your money"
          description="Add the first place your money lives — a bank, an e-wallet, cash. We'll keep the running total for you."
          action={
            <Link
              to="/accounts"
              className="btn-sheen inline-flex h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:brightness-[1.06]"
            >
              Add where your money lives
            </Link>
          }
        />
        <TransactionForm open={addOpen} onClose={() => setAddOpen(false)} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* ───────── Balance card — the one gradient "wow" surface ───────── */}
      <section className="brand-gradient animate-rise relative overflow-hidden rounded-[24px] p-6 text-white shadow-md">
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white/85">Your money</p>
            <button
              onClick={() => setHidden((h) => !h)}
              className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
              aria-label={hidden ? 'Show amount' : 'Hide amount'}
              aria-pressed={hidden}
            >
              {hidden ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          </div>

          <p className="mt-2 font-numeric text-[34px] font-extrabold leading-none tracking-tight lg:text-[40px]">
            {hidden ? (
              `${symbol} ••••••`
            ) : (
              <AnimatedNumber value={money.total} format={(v) => formatMoney(v, base)} />
            )}
          </p>

          <p className="mt-2 text-xs font-medium text-white/70">
            as of {format(new Date(), 'd MMMM')} · in {base}
          </p>

          {money.missing.length > 0 && (
            <Link
              to="/currencies"
              className="mt-1 inline-block text-xs font-semibold text-white underline-offset-2 hover:underline"
            >
              Add a rate for {money.missing.join(', ')} to include it
            </Link>
          )}

          {!hidden && money.debts > 0 && (
            <p className="mt-4 text-sm font-medium text-white/85">
              You own{' '}
              <span className="font-numeric font-bold text-white">
                {formatMoney(money.assets, base, { signDisplay: 'never' })}
              </span>
              <span className="px-1.5 text-white/45">·</span>
              You owe{' '}
              <span className="font-numeric font-bold text-white">
                {formatMoney(money.debts, base, { signDisplay: 'never' })}
              </span>
            </p>
          )}

          {!hidden && otherCurrencies.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {otherCurrencies.map(([c, total]) => (
                <span
                  key={c}
                  className="rounded-full bg-white/15 px-2.5 py-1 font-numeric text-xs font-semibold text-white"
                >
                  {getCurrency(c).symbol} {formatMoney(total, c, { signDisplay: 'never' })}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ───────── Quick actions ───────── */}
      <section className="animate-rise stagger-1 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <QuickTile label="Record" icon={Plus} chip="blue" onClick={() => setAddOpen(true)} />
        <QuickTile label="Accounts" icon={Wallet} chip="green" to="/accounts" />
        <QuickTile label="Budgets" icon={Target} chip="orange" to="/budgets" />
        <QuickTile label="Goals" icon={PiggyBank} chip="violet" to="/goals" />
        <QuickTile label="Bills" icon={Receipt} chip="blue" to="/bills" />
        <QuickTile label="Reports" icon={BarChart3} chip="green" to="/reports" />
      </section>

      {/* ───────── This month — In / Out / Kept ───────── */}
      <section className="animate-rise stagger-2 card-surface grid grid-cols-3 divide-x divide-border overflow-hidden rounded-[20px]">
        <MonthCell
          label="Money in"
          amount={month.earned}
          format={(v) => formatMoney(v, base, { signDisplay: 'never' })}
          delta={deltaOf(month.earned, month.prevEarned, true)}
        />
        <MonthCell
          label="Money out"
          amount={month.spent}
          format={(v) => formatMoney(v, base, { signDisplay: 'never' })}
          delta={deltaOf(month.spent, month.prevSpent, false)}
        />
        <MonthCell
          label="Kept"
          amount={month.net}
          format={(v) => formatMoney(v, base, { signDisplay: 'always' })}
          valueClass={month.net >= 0 ? 'text-positive' : 'text-negative'}
          delta={deltaOf(month.net, month.prevEarned - month.prevSpent, true)}
        />
      </section>

      {/* ───────── Recent activity ───────── */}
      <section className="animate-rise stagger-3">
        <div className="mb-1 flex items-baseline justify-between px-1">
          <h2 className="text-base font-bold text-foreground">Recent activity</h2>
          <Link
            to="/transactions"
            className="text-sm font-semibold text-primary transition hover:underline"
          >
            See all
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="Tap Record to write down your first one."
          />
        ) : (
          <Card className="divide-y divide-border px-4 py-1">
            {recent.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} accounts={accountMap} categories={categoryMap} />
            ))}
          </Card>
        )}
      </section>

      <TransactionForm open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

/** Persist the hide-balance toggle so the choice survives reloads. */
function useHiddenBalance() {
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tracr:balance-hidden') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('tracr:balance-hidden', hidden ? '1' : '0')
    } catch {
      /* private mode — ignore */
    }
  }, [hidden])
  return [hidden, setHidden] as const
}

/** One quick-action tile: a tinted icon chip over a plain label. Renders as a
 *  link or a button depending on the action. */
function QuickTile({
  label,
  icon: Icon,
  chip,
  to,
  onClick,
}: {
  label: string
  icon: IconType
  chip: keyof typeof CHIP | string
  to?: string
  onClick?: () => void
}) {
  const inner = (
    <>
      <span className={cn('flex h-14 w-14 items-center justify-center rounded-2xl', CHIP[chip])}>
        <Icon className="h-6 w-6 stroke-[2.2]" />
      </span>
      <span className="text-xs font-semibold text-foreground">{label}</span>
    </>
  )
  const cls =
    'pressable flex flex-col items-center gap-2 rounded-2xl py-2 transition-colors hover:bg-surface-muted'
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} aria-label={label}>
      {inner}
    </button>
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

/** One column of the this-month strip: label, number, vs-last-month chip. */
function MonthCell({
  label,
  amount,
  format: fmt,
  valueClass,
  delta,
}: {
  label: string
  amount: number
  format: (value: number) => string
  valueClass?: string
  delta?: Delta
}) {
  return (
    <div className="px-3 py-3.5 sm:px-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 truncate font-numeric text-base font-extrabold leading-tight sm:text-lg',
          valueClass ?? 'text-foreground',
        )}
      >
        <AnimatedNumber value={amount} format={fmt} />
      </p>
      {delta && (
        <p className="mt-0.5 truncate text-xs font-semibold">
          <span className={delta.good ? 'text-positive' : 'text-negative'}>
            {delta.pct >= 0 ? '▲' : '▼'} {Math.abs(delta.pct).toFixed(0)}%
          </span>{' '}
          <span className="font-medium text-muted-foreground">vs {prevMonthName()}</span>
        </p>
      )}
    </div>
  )
}

/** "May", "April" — deltas name the month they compare against. */
function prevMonthName() {
  return format(subMonths(new Date(), 1), 'MMM')
}

/** Mirrors the home layout so loading → loaded swaps without layout shift. */
function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-5" aria-busy="true" aria-label="Loading home">
      <Skeleton className="h-44 rounded-[24px]" />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 py-2">
            <Skeleton className="h-14 w-14 rounded-2xl" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
      <Skeleton className="h-24 rounded-[20px]" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-64 rounded-[20px]" />
      </div>
    </div>
  )
}
