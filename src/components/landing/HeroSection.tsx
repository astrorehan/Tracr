import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowRight,
  Banknote,
  Check,
  Coffee,
  Plus,
  ShoppingBag,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useT } from '@/features/settings/language-context'
import { dateLocale, type MsgKey } from '@/i18n'
import { cn } from '@/lib/utils'

interface TxItem {
  id: string
  icon: typeof Coffee
  chipClass: string
  title: string
  sub: string
  amount: number
  isIncome: boolean
}

const CHIP_EXPENSE = 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
const CHIP_INCOME = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
const CHIP_SHOPPING = 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
const CHIP_BILL = 'bg-blue-500/15 text-blue-600 dark:text-blue-400'

const START_BALANCE = 12_480_000
/** The demo's pretend daily allowance. Also the full width of the progress bar. */
const DAILY_BUDGET = 200_000
const START_BUDGET_LEFT = 175_000

/** Preset entries the demo plays through on its own, one every few seconds. */
const AUTO_PLAY: { titleKey: MsgKey; amount: number; isIncome: boolean; icon: typeof Coffee; chipClass: string; wallet: string }[] = [
  { titleKey: 'land.heroSimCoffee', amount: 25_000, isIncome: false, icon: Coffee, chipClass: CHIP_EXPENSE, wallet: 'BCA' },
  { titleKey: 'land.heroSimFreelance', amount: 1_500_000, isIncome: true, icon: Banknote, chipClass: CHIP_INCOME, wallet: 'Mandiri' },
  { titleKey: 'land.heroSimGroceries', amount: 85_000, isIncome: false, icon: ShoppingBag, chipClass: CHIP_SHOPPING, wallet: 'GoPay' },
  { titleKey: 'land.heroSimElectricity', amount: 100_000, isIncome: false, icon: Zap, chipClass: CHIP_BILL, wallet: 'BCA' },
]

/**
 * Pull a rupiah amount out of free text the way the real bot does: a bare
 * number is taken literally, but the usual shorthands scale it up — "35k" and
 * "35rb" are 35.000, "2jt" is 2.000.000.
 */
function parseAmount(text: string): number {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(jt|juta|m|k|rb|ribu)?/i)
  if (!match) return 50_000

  const value = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return 50_000

  switch (match[2]?.toLowerCase()) {
    case 'jt':
    case 'juta':
    case 'm':
      return Math.round(value * 1_000_000)
    case 'k':
    case 'rb':
    case 'ribu':
      return Math.round(value * 1_000)
    default:
      return Math.round(value)
  }
}

const INCOME_WORDS = ['gaji', 'dapat', 'masuk', 'honor', 'bonus', 'salary', 'income', 'paid']

export function HeroSection({ ctaTo }: { ctaTo: string }) {
  const { t } = useT()

  // Interactive phone mockup state
  const [balance, setBalance] = useState(START_BALANCE)
  const [dailyBudgetLeft, setDailyBudgetLeft] = useState(START_BUDGET_LEFT)
  const [customInput, setCustomInput] = useState('')
  const [lastAddedId, setLastAddedId] = useState<string | null>(null)

  const [txList, setTxList] = useState<TxItem[]>([
    {
      id: 'seed-coffee',
      icon: Coffee,
      chipClass: CHIP_EXPENSE,
      title: t('land.heroSimCoffee'),
      sub: 'BCA · 09:12',
      amount: 25_000,
      isIncome: false,
    },
    {
      id: 'seed-salary',
      icon: Banknote,
      chipClass: CHIP_INCOME,
      title: t('land.heroSimSalary'),
      sub: `BCA · ${t('land.heroMockYesterday')}`,
      amount: 8_500_000,
      isIncome: true,
    },
  ])

  const addTransaction = useCallback(
    (
      title: string,
      amount: number,
      isIncome: boolean,
      icon: typeof Coffee,
      chipClass: string,
      sub: string
    ) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setTxList((prev) => [{ id, icon, chipClass, title, sub, amount, isIncome }, ...prev.slice(0, 4)])
      setLastAddedId(id)

      if (isIncome) {
        // Money coming in tops the day's allowance back up, so a long-running
        // demo never gets stuck showing an empty bar and "nice pace".
        setBalance((b) => b + amount)
        setDailyBudgetLeft(START_BUDGET_LEFT)
      } else {
        setBalance((b) => Math.max(0, b - amount))
        setDailyBudgetLeft((prev) => Math.max(0, prev - amount))
      }
    },
    []
  )

  // Self-running demo. The step counter lives in a ref so re-renders caused by
  // each added row don't restart the sequence at the first preset.
  const stepRef = useRef(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const interval = setInterval(() => {
      const sim = AUTO_PLAY[stepRef.current % AUTO_PLAY.length]
      stepRef.current += 1
      addTransaction(
        t(sim.titleKey),
        sim.amount,
        sim.isIncome,
        sim.icon,
        sim.chipClass,
        `${sim.wallet} · ${t('land.heroMockAuto')}`
      )
    }, 4500)

    return () => clearInterval(interval)
  }, [addTransaction, t])

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = customInput.trim()
    if (!text) return

    const lower = text.toLowerCase()
    const isIncome = INCOME_WORDS.some((w) => lower.includes(w))

    addTransaction(
      text,
      parseAmount(text),
      isIncome,
      isIncome ? Banknote : ShoppingBag,
      isIncome ? CHIP_INCOME : CHIP_EXPENSE,
      'Telegram'
    )
    setCustomInput('')
  }

  const budgetPct = Math.min(100, Math.max(2, (dailyBudgetLeft / DAILY_BUDGET) * 100))

  return (
    <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-10 lg:grid-cols-2 lg:gap-8 lg:pt-16">
      {/* Left Column: Value Proposition */}
      <div className="max-w-xl">
        <div className="animate-rise stagger-1 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-bold tracking-wide text-white backdrop-blur-md shadow-sm">
          <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
          <span>{t('land.heroBadgeNew')}</span>
        </div>

        <h1 className="animate-rise stagger-2 mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]">
          {t('land.heroHeadlineA')}
          <br />
          <span className="bg-gradient-to-r from-cyan-200 via-sky-100 to-amber-200 bg-clip-text text-transparent">
            {t('land.heroHeadlineB')}
          </span>
        </h1>

        <p className="animate-rise stagger-3 mt-5 text-base font-medium leading-relaxed text-white/90 sm:text-lg">
          {t('land.heroSubNew')}
        </p>

        {/* CTA Buttons */}
        <div className="animate-rise stagger-4 mt-8 flex flex-wrap items-center gap-3">
          <Link
            to={ctaTo}
            className="group pressable inline-flex h-13 items-center gap-2 rounded-xl bg-white px-7 text-base font-bold text-[#0072bc] shadow-lg transition hover:bg-slate-50 hover:shadow-xl active:scale-95"
          >
            {t('land.tryFreeCta')}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <a
            href="#telegram-demo"
            onClick={(e) => {
              e.preventDefault()
              document
                .getElementById('telegram-demo')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="pressable inline-flex h-13 items-center rounded-xl border border-white/30 bg-white/10 px-6 text-base font-semibold text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95"
          >
            {t('land.testBotCta')}
          </a>
        </div>

        {/* Micro-Perks */}
        <ul className="animate-rise stagger-5 mt-8 flex flex-wrap gap-x-6 gap-y-2.5 text-xs font-semibold text-white/85 sm:text-sm">
          <li className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-emerald-400" /> {t('land.perk100Free')}
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-emerald-400" /> {t('land.perkNoCardNew')}
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-emerald-400" /> {t('land.perkOfflineReady')}
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-emerald-400" /> {t('land.perkSupabaseSecured')}
          </li>
        </ul>
      </div>

      {/* Right Column: Interactive Phone Mockup */}
      <div className="animate-rise stagger-3 relative mx-auto w-full max-w-[340px] sm:max-w-[370px]">
        {/* Floating AI Insight Card */}
        <div className="absolute -left-6 -top-6 z-20 hidden w-56 rounded-2xl border border-white/20 bg-background/90 p-3.5 text-foreground shadow-2xl backdrop-blur-md sm:block">
          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-500">
            <Sparkles className="h-4 w-4 text-indigo-500" /> {t('land.heroAiTitle')}
          </div>
          <p className="mt-1.5 text-xs font-medium leading-normal text-muted-foreground">
            {dailyBudgetLeft > 0
              ? t('land.heroAiBody', { amount: `Rp ${dailyBudgetLeft.toLocaleString('id-ID')}` })
              : t('land.heroAiBodyEmpty')}
          </p>
        </div>

        {/* Phone Frame */}
        <div className="relative rounded-[2.5rem] border-4 border-white/30 bg-slate-950/40 p-2.5 shadow-2xl backdrop-blur-xl">
          <div className="overflow-hidden rounded-[2.1rem] bg-background text-foreground shadow-inner">
            {/* Phone Status Bar */}
            <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[10px] font-bold text-muted-foreground">
              <span>09:41</span>
              <span className="h-3.5 w-16 rounded-full bg-muted/60" />
              <span>100% ⚡</span>
            </div>

            <div className="space-y-3.5 px-4 pb-4 pt-2">
              {/* Header Greeting */}
              <div className="flex items-center justify-between px-1">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground">
                    {format(new Date(), 'EEEE, d MMMM', { locale: dateLocale() })}
                  </p>
                  <p className="text-sm font-extrabold text-foreground">{t('land.heroMockGreeting')}</p>
                </div>
                <div className="brand-gradient flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold text-white shadow">
                  T
                </div>
              </div>

              {/* Dynamic Balance Hero Card */}
              <div className="brand-hero relative overflow-hidden rounded-2xl p-4 text-white shadow-md">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/80">
                    {t('land.heroMockBalanceTitle')}
                  </p>
                  <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {t('land.heroMockDemoBadge')}
                  </span>
                </div>
                <p className="mt-1.5 font-numeric text-2xl font-extrabold tracking-tight transition-all duration-300">
                  Rp {balance.toLocaleString('id-ID')}
                </p>

                {/* Safe-to-Spend Daily Bar */}
                <div className="mt-3 rounded-xl bg-black/20 p-2.5 backdrop-blur-sm">
                  <div className="flex justify-between text-[10px] font-semibold text-white/90">
                    <span>{t('land.mockDailySafeBudget')}</span>
                    <span className="font-bold text-emerald-300">Rp {dailyBudgetLeft.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-500"
                      style={{ width: `${budgetPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Quick Preset Action Chips */}
              <div>
                <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t('land.mockTapChipHint')}
                </p>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      addTransaction(
                        t('land.heroSimCoffee'),
                        25_000,
                        false,
                        Coffee,
                        CHIP_EXPENSE,
                        `BCA · ${t('land.heroMockNow')}`
                      )
                    }
                    className="pressable inline-flex items-center gap-1 rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-xs font-semibold shadow-xs transition hover:border-primary/50 hover:bg-primary-soft active:scale-95"
                  >
                    {t('land.heroChipCoffee')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      addTransaction(
                        t('land.heroSimSalary'),
                        5_000_000,
                        true,
                        Banknote,
                        CHIP_INCOME,
                        `BCA · ${t('land.heroMockNow')}`
                      )
                    }
                    className="pressable inline-flex items-center gap-1 rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-xs font-semibold shadow-xs transition hover:border-emerald-500/50 hover:bg-emerald-500/10 active:scale-95"
                  >
                    {t('land.heroChipSalary')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      addTransaction(
                        t('land.heroSimGroceries'),
                        150_000,
                        false,
                        ShoppingBag,
                        CHIP_SHOPPING,
                        `GoPay · ${t('land.heroMockNow')}`
                      )
                    }
                    className="pressable inline-flex items-center gap-1 rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-xs font-semibold shadow-xs transition hover:border-violet-500/50 hover:bg-violet-500/10 active:scale-95"
                  >
                    {t('land.heroChipGroceries')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      addTransaction(
                        t('land.heroSimElectricity'),
                        100_000,
                        false,
                        Zap,
                        CHIP_BILL,
                        `Mandiri · ${t('land.heroMockNow')}`
                      )
                    }
                    className="pressable inline-flex items-center gap-1 rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-xs font-semibold shadow-xs transition hover:border-blue-500/50 hover:bg-blue-500/10 active:scale-95"
                  >
                    {t('land.heroChipElectricity')}
                  </button>
                </div>
              </div>

              {/* Custom Input Form */}
              <form onSubmit={handleCustomSubmit} className="flex gap-1.5">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder={t('land.heroMockInputPlaceholder')}
                  aria-label={t('land.heroMockInputPlaceholder')}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  aria-label={t('land.heroMockAddAria')}
                  className="flex shrink-0 items-center justify-center rounded-xl bg-primary px-3 py-2 text-primary-foreground transition hover:opacity-90 active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </form>

              {/* Transactions List */}
              <div className="card-surface rounded-2xl p-3 shadow-xs">
                <div className="flex items-center justify-between px-1 pb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t('land.heroMockTxTitle')}
                  </p>
                  <span className="text-[9px] font-medium text-emerald-500 animate-pulse">
                    {t('land.heroMockLive')}
                  </span>
                </div>
                <div className="space-y-2">
                  {txList.map((tx) => {
                    const Icon = tx.icon
                    const isNew = tx.id === lastAddedId
                    return (
                      <div
                        key={tx.id}
                        className={cn(
                          'flex items-center gap-2.5 rounded-xl p-1.5 transition-all duration-300',
                          isNew ? 'bg-primary/10 ring-1 ring-primary/30' : ''
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                            tx.chipClass
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold">{tx.title}</p>
                          <p className="text-[10px] font-medium text-muted-foreground">{tx.sub}</p>
                        </div>
                        <p
                          className={cn(
                            'font-numeric text-xs font-bold whitespace-nowrap',
                            tx.isIncome ? 'text-positive' : 'text-negative'
                          )}
                        >
                          {tx.isIncome ? '+' : '-'}Rp {tx.amount.toLocaleString('id-ID')}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
