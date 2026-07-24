import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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

export function HeroSection({ ctaTo }: { ctaTo: string }) {
  const { t } = useT()

  // Interactive phone mockup state
  const [balance, setBalance] = useState(12480000)
  const [dailyBudgetLeft, setDailyBudgetLeft] = useState(175000)
  const [customInput, setCustomInput] = useState('')
  const [lastAddedId, setLastAddedId] = useState<string | null>(null)

  const [txList, setTxList] = useState<TxItem[]>([
    {
      id: '1',
      icon: Coffee,
      chipClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
      title: 'Kopi Kenangan',
      sub: 'BCA · 09:12',
      amount: 25000,
      isIncome: false,
    },
    {
      id: '2',
      icon: Banknote,
      chipClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      title: 'Gaji Transfer',
      sub: 'BCA · Kemarin',
      amount: 8500000,
      isIncome: true,
    },
  ])

  // Self-running Auto Simulation Loop
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const presetSimulations = [
      { title: 'Kopi Kenangan', amount: 25000, isIncome: false, icon: Coffee, chipClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', sub: 'BCA · Auto Log' },
      { title: 'Honor Freelance', amount: 1500000, isIncome: true, icon: Banknote, chipClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', sub: 'Mandiri · Auto Log' },
      { title: 'Belanja Minimarket', amount: 85000, isIncome: false, icon: ShoppingBag, chipClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', sub: 'GoPay · Auto Log' },
      { title: 'Token Listrik PLN', amount: 100000, isIncome: false, icon: Zap, chipClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', sub: 'BCA · Auto Log' },
    ]

    let step = 0
    const interval = setInterval(() => {
      const sim = presetSimulations[step % presetSimulations.length]
      step++
      handleAddTransaction(sim.title, sim.amount, sim.isIncome, sim.icon, sim.chipClass, sim.sub)
    }, 4500)

    return () => clearInterval(interval)
  }, [])

  const handleAddTransaction = (
    title: string,
    amount: number,
    isIncome: boolean,
    icon: typeof Coffee,
    chipClass: string,
    sub = 'Live Demo'
  ) => {
    const id = Date.now().toString()
    const newTx: TxItem = {
      id,
      icon,
      chipClass,
      title,
      sub,
      amount,
      isIncome,
    }

    setTxList((prev) => [newTx, ...prev.slice(0, 4)])
    setLastAddedId(id)

    if (isIncome) {
      setBalance((b) => b + amount)
    } else {
      setBalance((b) => b - amount)
      setDailyBudgetLeft((prev) => Math.max(0, prev - amount))
    }
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customInput.trim()) return

    const inputLower = customInput.toLowerCase()
    let amount = 50000
    const match = customInput.match(/\d+/)
    if (match) {
      const num = parseInt(match[0], 10)
      amount = num < 1000 ? num * 1000 : num
    }

    const isIncome = inputLower.includes('gaji') || inputLower.includes('dapat') || inputLower.includes('masuk')

    handleAddTransaction(
      customInput,
      amount,
      isIncome,
      isIncome ? Banknote : ShoppingBag,
      isIncome ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
      'Telegram Bot'
    )
    setCustomInput('')
  }

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
              const el = document.getElementById('telegram-demo')
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
            {t('land.heroAiBody', { amount: `Rp ${dailyBudgetLeft.toLocaleString('id-ID')}` })}
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
                    {t('land.heroMockDate')}
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
                    PWA Live
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
                      style={{ width: `${Math.min(100, Math.max(10, (dailyBudgetLeft / 200000) * 100))}%` }}
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
                      handleAddTransaction(
                        'Kopi Kenangan',
                        25000,
                        false,
                        Coffee,
                        'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                        'BCA · Instant'
                      )
                    }
                    className="pressable inline-flex items-center gap-1 rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-xs font-semibold shadow-xs transition hover:border-primary/50 hover:bg-primary-soft active:scale-95"
                  >
                    ☕ Kopi 25k
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddTransaction(
                        'Bonus / Gaji',
                        5000000,
                        true,
                        Banknote,
                        'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                        'BCA · Instant'
                      )
                    }
                    className="pressable inline-flex items-center gap-1 rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-xs font-semibold shadow-xs transition hover:border-emerald-500/50 hover:bg-emerald-500/10 active:scale-95"
                  >
                    💰 Gaji 5jt
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddTransaction(
                        'Belanja Supermarket',
                        150000,
                        false,
                        ShoppingBag,
                        'bg-violet-500/15 text-violet-600 dark:text-violet-400',
                        'GoPay · Instant'
                      )
                    }
                    className="pressable inline-flex items-center gap-1 rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-xs font-semibold shadow-xs transition hover:border-violet-500/50 hover:bg-violet-500/10 active:scale-95"
                  >
                    🛒 Belanja 150k
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddTransaction(
                        'Token Listrik PLN',
                        100000,
                        false,
                        Zap,
                        'bg-blue-500/15 text-blue-600 dark:text-blue-400',
                        'Mandiri · Instant'
                      )
                    }
                    className="pressable inline-flex items-center gap-1 rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-xs font-semibold shadow-xs transition hover:border-blue-500/50 hover:bg-blue-500/10 active:scale-95"
                  >
                    ⚡ PLN 100k
                  </button>
                </div>
              </div>

              {/* Custom Input Form */}
              <form onSubmit={handleCustomSubmit} className="flex gap-1.5">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Ketik cth: Makan 35k..."
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  className="flex shrink-0 items-center justify-center rounded-xl bg-primary px-3 py-2 text-primary-foreground transition hover:opacity-90 active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </form>

              {/* Transactions List */}
              <div className="card-surface rounded-2xl p-3 shadow-xs">
                <div className="flex items-center justify-between px-1 pb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Transaksi Hari Ini
                  </p>
                  <span className="text-[9px] font-medium text-emerald-500 animate-pulse">Live Feed</span>
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
                            'font-numeric text-xs font-bold',
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
