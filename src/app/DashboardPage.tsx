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
  LayoutGrid,
  Tag,
  Moon,
  Sun,
  ChevronRight,
  ListOrdered,
  type LucideProps,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { IconChip, ListRow } from '@/components/ui/list'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { EmptyState, Skeleton } from '@/components/ui/States'
import { pctChange } from '@/features/reports/reports'
import { formatMoney } from '@/lib/money'
import { getCurrency } from '@/lib/currencies'
import { useAuth } from '@/features/auth/useAuth'
import { useTheme } from '@/features/settings/theme-context'
import { useT } from '@/features/settings/language-context'
import { dateLocale, type MsgKey } from '@/i18n'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { useAccounts, useBalances } from '@/features/accounts/api'
import { accountTypeMeta } from '@/features/accounts/meta'
import type { Account } from '@/types/db'
import { useCategories } from '@/features/categories/api'
import { useTransactions } from '@/features/transactions/api'
import { useFxRates } from '@/features/fx/api'
import { buildRateTable, convertMinor } from '@/features/fx/fx'
import { TransactionRow } from '@/features/transactions/TransactionRow'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import { AiHomeCard } from '@/features/ai/AiHomeCard'
import { indexById } from '@/lib/collections'
import { cn } from '@/lib/utils'

type IconType = ComponentType<LucideProps>

/** Quick-action tiles. Chip accents are the only place color lives on the home. */
const CHIP: Record<string, string> = {
  blue: 'border border-border bg-surface text-chip-blue-fg',
  green: 'border border-border bg-surface text-chip-green-fg',
  orange: 'border border-border bg-surface text-chip-orange-fg',
  violet: 'border border-border bg-surface text-chip-violet-fg',
}

export function DashboardPage() {
  const { profile } = useAuth()
  const { theme, toggle } = useTheme()
  const { t } = useT()
  const base = profile?.base_currency ?? 'IDR'
  const firstName = profile?.display_name?.split(' ')[0]

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
      <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-0">
        <EmptyState
          icon={<Wallet className="h-7 w-7" />}
          title={t('dash.emptyTitle')}
          description={t('dash.emptyDesc')}
          action={
            <Link
              to="/accounts"
              className="btn-sheen inline-flex h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:brightness-[1.06]"
            >
              {t('dash.emptyAction')}
            </Link>
          }
        />
        <TransactionForm open={addOpen} onClose={() => setAddOpen(false)} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl lg:max-w-none lg:px-8">
      {/* Mobile: the blue is a FIXED background layer. The hero text below scrolls
          in normal flow over it, then slides under the white sheet. */}
      <div aria-hidden className="brand-hero pointer-events-none fixed inset-x-0 top-0 h-[45vh] z-0 sm:hidden" />

      {/* Desktop splits into a primary column (hero, actions, assistant) and a
          right rail (accounts + activity summary). Below lg it all stacks into the
          single scrolling column. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-8">
      {/* ───────── Primary column ───────── */}
      <div className="min-w-0">

      {/* ───────── Balance hero — full-bleed gradient (GoPay saldo card) ───────── */}
      <section className="brand-hero relative z-10 overflow-hidden px-4 pb-7 pt-4 text-white max-sm:bg-none sm:mt-6 sm:rounded-[24px] sm:px-6 sm:pb-6 sm:pt-5">
        <div className="relative z-10">
          {/* Mobile top bar — the shared header is hidden on home/mobile */}
          <div className="mb-4 flex items-center justify-between gap-3 sm:hidden">
            <p className="truncate text-base font-bold">
              {t(greetingKey())}
              {firstName ? `, ${firstName}` : ''} 👋
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <NotificationBell variant="onDark" />
              <button
                onClick={toggle}
                className="pressable flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25"
                aria-label={t('layout.toggleTheme')}
              >
                {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>
              <Link to="/settings" aria-label={t('layout.profileSettings')} className="pressable">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-9 w-9 rounded-xl border border-white/30 object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-sm font-bold text-white">
                    {(profile?.display_name ?? 'U').charAt(0).toUpperCase()}
                  </div>
                )}
              </Link>
            </div>
          </div>

          {/* Balance + primary actions */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white/85">{t('dash.yourMoney')}</p>
              <div className="mt-1 flex items-center gap-2.5">
                <p className="font-numeric text-[32px] font-extrabold leading-none tracking-tight sm:text-[38px]">
                  {hidden ? (
                    `${symbol} ••••••`
                  ) : (
                    <AnimatedNumber value={money.total} format={(v) => formatMoney(v, base)} />
                  )}
                </p>
                <button
                  onClick={() => setHidden((h) => !h)}
                  className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/18 text-white transition hover:bg-white/28"
                  aria-label={hidden ? t('dash.showAmount') : t('dash.hideAmount')}
                  aria-pressed={hidden}
                >
                  {hidden ? <EyeOff className="h-[17px] w-[17px]" /> : <Eye className="h-[17px] w-[17px]" />}
                </button>
              </div>

              {!hidden && money.debts > 0 && (
                <p className="mt-2 text-xs font-medium text-white/80">
                  {t('dash.own', { amount: formatMoney(money.assets, base, { signDisplay: 'never' }) })}
                  <span className="px-1 text-white/40">·</span>
                  {t('dash.owe', { amount: formatMoney(money.debts, base, { signDisplay: 'never' }) })}
                </p>
              )}

              <Link
                to="/reports"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white/90 transition hover:text-white"
              >
                <BarChart3 className="h-4 w-4" />
                {t('dash.spentIn', {
                  amount: formatMoney(month.spent, base, { signDisplay: 'never' }),
                  month: format(new Date(), 'MMMM', { locale: dateLocale() }),
                })}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="flex shrink-0 flex-col gap-2">
              <button
                onClick={() => setAddOpen(true)}
                className="pressable flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-primary"
              >
                <Plus className="h-4 w-4 stroke-[2.6]" /> {t('dash.record')}
              </button>
              <Link
                to="/transactions"
                className="pressable flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/12 px-3.5 py-2 text-xs font-bold text-white"
              >
                <ListOrdered className="h-4 w-4" /> {t('dash.history')}
              </Link>
            </div>
          </div>

          {money.missing.length > 0 && (
            <Link
              to="/currencies"
              className="mt-3 inline-block text-xs font-semibold text-white underline-offset-2 hover:underline"
            >
              {t('dash.addRate', { codes: money.missing.join(', ') })}
            </Link>
          )}

          {/* Currency + account chips */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {!hidden &&
              otherCurrencies.map(([c, total]) => (
                <span
                  key={c}
                  className="rounded-full border border-white/25 bg-white/12 px-2.5 py-1 font-numeric text-xs font-semibold text-white"
                >
                  {getCurrency(c).symbol} {formatMoney(total, c, { signDisplay: 'never' })}
                </span>
              ))}
            <Link
              to="/accounts"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/12 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              <Wallet className="h-3.5 w-3.5" />
              {t(accounts.length === 1 ? 'dash.accountCount.one' : 'dash.accountCount.many', {
                n: accounts.length,
              })}
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── Content sheet — slides up over the hero ───────── */}
      <div className="relative z-10 -mt-5 space-y-5 rounded-t-[26px] bg-background px-4 pb-2 pt-5 sm:mt-6 sm:rounded-none sm:bg-transparent sm:px-0 sm:pt-0">
        {/* Quick actions */}
        <Card className="grid grid-cols-4 gap-x-1 gap-y-4 p-4">
          <QuickTile label={t('dash.record')} icon={Plus} chip="blue" onClick={() => setAddOpen(true)} />
          <QuickTile label={t('nav.accounts')} icon={Wallet} chip="green" to="/accounts" />
          <QuickTile label={t('nav.budgets')} icon={Target} chip="orange" to="/budgets" />
          <QuickTile label={t('nav.goals')} icon={PiggyBank} chip="violet" to="/goals" />
          <QuickTile label={t('nav.bills')} icon={Receipt} chip="blue" to="/bills" />
          <QuickTile label={t('nav.reports')} icon={BarChart3} chip="green" to="/reports" />
          <QuickTile label={t('section.categories')} icon={LayoutGrid} chip="orange" to="/categories" />
          <QuickTile label={t('section.tags')} icon={Tag} chip="violet" to="/tags" />
        </Card>

        {/* This month — In / Out / Kept */}
        <section className="card-surface grid grid-cols-3 divide-x divide-border overflow-hidden rounded-[20px]">
          <MonthCell
            label={t('dash.moneyIn')}
            amount={month.earned}
            format={(v) => formatMoney(v, base, { signDisplay: 'never' })}
            delta={deltaOf(month.earned, month.prevEarned, true)}
          />
          <MonthCell
            label={t('dash.moneyOut')}
            amount={month.spent}
            format={(v) => formatMoney(v, base, { signDisplay: 'never' })}
            delta={deltaOf(month.spent, month.prevSpent, false)}
          />
          <MonthCell
            label={t('dash.kept')}
            amount={month.net}
            format={(v) => formatMoney(v, base, { signDisplay: 'always' })}
            valueClass={month.net >= 0 ? 'text-positive' : 'text-negative'}
            delta={deltaOf(month.net, month.prevEarned - month.prevSpent, true)}
          />
        </section>

        {/* Assistant — chat about your money */}
        <AiHomeCard />
        </div>
        {/* end content sheet */}
        </div>
        {/* end primary column */}

        {/* ───────── Right rail — accounts & activity summary ─────────
            On desktop this is the second grid column; below lg it stacks under the
            primary column (opaque bg so it clears the mobile fixed hero). */}
        <aside className="relative z-10 space-y-5 bg-background px-4 pb-6 pt-1 sm:bg-transparent sm:px-0 sm:pt-0 lg:mt-16">
          <AccountsPanel accounts={accounts} balances={balances} hidden={hidden} />

          {/* Recent activity */}
          <section>
            <div className="mb-1 flex items-baseline justify-between px-1">
              <h2 className="text-base font-bold text-foreground">{t('dash.recentActivity')}</h2>
              <Link
                to="/transactions"
                className="text-sm font-semibold text-primary transition hover:underline"
              >
                {t('dash.seeAll')}
              </Link>
            </div>
            {recent.length === 0 ? (
              <EmptyState title={t('dash.nothingYet')} description={t('dash.tapRecord')} />
            ) : (
              <Card className="divide-y divide-border px-4 py-1">
                {recent.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} accounts={accountMap} categories={categoryMap} />
                ))}
              </Card>
            )}
          </section>

          {/* Light / dark switch — big, playful, GoPay-style */}
          <section className="pb-4 pt-4 text-center">
            <h2 className="text-xl font-extrabold tracking-tight text-foreground">
              {t('dash.lightOrDark')}
            </h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">{t('dash.flipSwitch')}</p>

            <button
              type="button"
              role="switch"
              aria-checked={theme === 'dark'}
              onClick={toggle}
              aria-label={t('dash.switchTheme')}
              className="pressable mx-auto mt-7 flex h-[128px] w-[128px] items-center justify-center rounded-[30px] bg-surface-muted"
            >
              <span
                className={cn(
                  'flex h-[60px] w-[92px] items-center rounded-full p-1.5 shadow-inner transition-colors duration-300',
                  theme === 'dark' ? 'bg-primary/80' : 'bg-border',
                )}
              >
                <span
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full bg-surface shadow-md transition-transform duration-300',
                    theme === 'dark' ? 'translate-x-[32px]' : 'translate-x-0',
                  )}
                >
                  {theme === 'dark' ? (
                    <Moon className="h-5 w-5 text-primary" />
                  ) : (
                    <Sun className="h-5 w-5 text-warning" />
                  )}
                </span>
              </span>
            </button>

            <p className="mx-auto mt-7 max-w-[280px] text-sm font-medium text-muted-foreground">
              {t('dash.onePlace')}
            </p>
          </section>
        </aside>
      </div>
      {/* end desktop grid */}

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
      <span className={cn('flex h-13 w-13 items-center justify-center rounded-2xl', CHIP[chip])}>
        <Icon className="h-6 w-6 stroke-[2.1]" />
      </span>
      <span className="text-[11.5px] font-semibold text-foreground">{label}</span>
    </>
  )
  const cls =
    'pressable flex flex-col items-center gap-2 rounded-2xl py-1 transition-colors hover:bg-surface-muted'
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

/** Right-rail accounts summary: the first few accounts with their balances.
 *  Deliberately shallow — the full breakdown lives on the Accounts tab. */
function AccountsPanel({
  accounts,
  balances,
  hidden,
}: {
  accounts: Account[]
  balances: Record<string, number>
  hidden: boolean
}) {
  const { t } = useT()
  const shown = accounts.slice(0, 5)
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-baseline justify-between px-1">
        <h2 className="text-base font-bold text-foreground">{t('nav.accounts')}</h2>
        <Link
          to="/accounts"
          className="text-sm font-semibold text-primary transition hover:underline"
        >
          {t('dash.seeAll')}
        </Link>
      </div>
      <div className="divide-y divide-border">
        {shown.map((a) => {
          const meta = accountTypeMeta(a.type)
          const balance = balances[a.id] ?? a.opening_balance
          return (
            <ListRow
              key={a.id}
              to={`/accounts/${a.id}`}
              chevron={false}
              leading={<IconChip icon={meta.icon} color={a.color ?? '#0072BC'} />}
              title={a.name}
              subtitle={t(meta.label)}
              trailing={
                <p
                  className={cn(
                    'font-numeric text-sm font-extrabold tracking-tight',
                    a.is_liability ? 'text-danger' : 'text-foreground',
                  )}
                >
                  {hidden ? '••••' : formatMoney(balance, a.currency)}
                </p>
              }
            />
          )
        })}
      </div>
    </Card>
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
  const { t } = useT()
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
          <span className="font-medium text-muted-foreground">{t('dash.vs', { month: prevMonthName() })}</span>
        </p>
      )}
    </div>
  )
}

/** "May", "April" — deltas name the month they compare against. */
function prevMonthName() {
  return format(subMonths(new Date(), 1), 'MMM', { locale: dateLocale() })
}

function greetingKey(): MsgKey {
  const h = new Date().getHours()
  if (h < 12) return 'greeting.morning'
  if (h < 18) return 'greeting.afternoon'
  return 'greeting.evening'
}

/** Mirrors the home layout so loading → loaded swaps without layout shift. */
function DashboardSkeleton() {
  const { t } = useT()
  return (
    <div className="mx-auto max-w-2xl" aria-busy="true" aria-label={t('dash.loadingHome')}>
      <Skeleton className="h-52 rounded-none sm:mt-6 sm:h-44 sm:rounded-[24px]" />
      <div className="-mt-5 space-y-5 rounded-t-[26px] bg-background px-4 pb-2 pt-5 sm:mt-6 sm:rounded-none sm:bg-transparent sm:px-0 sm:pt-0">
        <div className="grid grid-cols-4 gap-x-1 gap-y-4 rounded-[20px] border border-border bg-surface p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 py-1">
              <Skeleton className="h-13 w-13 rounded-2xl" />
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
    </div>
  )
}
