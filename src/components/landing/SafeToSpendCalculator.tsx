import { useState } from 'react'
import { Calculator, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react'
import { useT } from '@/features/settings/language-context'
import { cn } from '@/lib/utils'

export function SafeToSpendCalculator() {
  const { t } = useT()

  const [income, setIncome] = useState(8000000)
  const [fixedExpenses, setFixedExpenses] = useState(3500000)

  // Calculations
  const freeMonthly = Math.max(0, income - fixedExpenses)
  const dailySafeLimit = Math.floor(freeMonthly / 30)

  const isSafe = dailySafeLimit >= 50000

  return (
    <section id="calculator" className="scroll-mt-12 border-y border-border bg-surface py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <Calculator className="h-4 w-4" /> {t('land.calcTitle')}
          </div>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {t('land.calcHeadingMain')}
          </h2>
          <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
            {t('land.calcSub')}
          </p>
        </div>

        {/* Calculator Widget Box */}
        <div className="mt-12 mx-auto max-w-4xl grid gap-8 lg:grid-cols-12 items-center card-surface rounded-3xl p-6 sm:p-10 border border-border shadow-xl">
          {/* Sliders Column */}
          <div className="lg:col-span-7 space-y-7">
            {/* Slider 1: Pendapatan Bulanan */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-bold text-foreground">
                  {t('land.calcIncome')}
                </label>
                <span className="font-numeric text-base font-extrabold text-primary">
                  Rp {income.toLocaleString('id-ID')}
                </span>
              </div>
              <input
                type="range"
                min={2000000}
                max={30000000}
                step={500000}
                value={income}
                onChange={(e) => setIncome(Number(e.target.value))}
                className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-medium text-muted-foreground mt-1">
                <span>Rp 2.000.000</span>
                <span>Rp 30.000.000</span>
              </div>
            </div>

            {/* Slider 2: Tagihan & Tabungan Wajib */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-bold text-foreground">
                  {t('land.calcFixed')}
                </label>
                <span className="font-numeric text-base font-extrabold text-amber-600 dark:text-amber-400">
                  Rp {fixedExpenses.toLocaleString('id-ID')}
                </span>
              </div>
              <input
                type="range"
                min={500000}
                max={Math.max(1000000, income)}
                step={250000}
                value={fixedExpenses}
                onChange={(e) => setFixedExpenses(Number(e.target.value))}
                className="w-full accent-amber-500 h-2 bg-muted rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-medium text-muted-foreground mt-1">
                <span>Rp 500.000</span>
                <span>Rp {income.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div className="rounded-2xl bg-background p-4 border border-border text-xs text-muted-foreground flex items-center gap-3">
              <Sparkles className="h-5 w-5 shrink-0 text-amber-400" />
              <p>
                {t('land.calcFreeMonthlyNote')}
              </p>
            </div>
          </div>

          {/* Result Output Card */}
          <div className="lg:col-span-5">
            <div className={cn(
              'rounded-3xl p-6 text-center text-white shadow-lg transition-all duration-300 relative overflow-hidden animate-pulse-glow',
              isSafe ? 'brand-hero' : 'bg-gradient-to-br from-amber-600 to-rose-700'
            )}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                {isSafe ? (
                  <>
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    {t('land.calcStatusSafe')}
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-200" />
                    {t('land.calcStatusWarning')}
                  </>
                )}
              </span>

              <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-white/80">
                {t('land.calcDailyResult')}
              </p>

              <div className="mt-2 font-numeric text-3xl sm:text-4xl font-extrabold tracking-tight">
                Rp {dailySafeLimit.toLocaleString('id-ID')}
                <span className="text-sm font-semibold opacity-80"> {t('land.calcPerDay')}</span>
              </div>

              <div className="mt-6 border-t border-white/20 pt-4 text-xs font-medium text-white/90">
                <p>
                  {t('land.calcFreeMonthlyLabel')}{' '}
                  <strong className="font-bold text-white">Rp {freeMonthly.toLocaleString('id-ID')}</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
