import { useState } from 'react'
import {
  Wallet,
  Briefcase,
  TrendingUp,
  ArrowDownLeft,
  PackageCheck,
  UserCheck,
  Sparkles,
} from 'lucide-react'
import { useT } from '@/features/settings/language-context'
import { cn } from '@/lib/utils'

export function BookToggleSection() {
  const { t } = useT()
  const [activeTab, setActiveTab] = useState<'personal' | 'business'>('personal')

  return (
    <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
      {/* Header */}
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t('land.toggleTitle')}
        </h2>
        <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
          {t('land.toggleSub')}
        </p>

        {/* Segmented Switch Control */}
        <div className="mt-8 inline-flex items-center rounded-2xl border border-border bg-surface p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('personal')}
            className={cn(
              'pressable flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-300',
              activeTab === 'personal'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Wallet className="h-4 w-4" />
            {t('land.tabPersonal')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('business')}
            className={cn(
              'pressable flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-300',
              activeTab === 'business'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Briefcase className="h-4 w-4" />
            {t('land.tabBusiness')}
          </button>
        </div>
      </div>

      {/* Tab Content Display */}
      <div key={activeTab} className="mt-12">
        {activeTab === 'personal' ? (
          <div className="grid gap-6 md:grid-cols-3">
            {/* Personal Card 1 */}
            <div className="card-surface card-hover animate-card-pop-1 rounded-3xl p-6 border border-border/80 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-primary/40">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Wallet className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{t('land.bookPers1Title')}</h3>
              <p className="mt-1.5 text-sm font-medium text-muted-foreground">
                {t('land.bookPers1Desc')}
              </p>
              <div className="mt-5 space-y-2 rounded-2xl bg-background p-3 text-xs">
                <div className="flex justify-between font-semibold">
                  <span>GoPay Balance</span>
                  <span className="font-bold text-foreground">Rp 1.450.000</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Bank BCA Rekening</span>
                  <span className="font-bold text-foreground">Rp 10.500.000</span>
                </div>
              </div>
            </div>

            {/* Personal Card 2 */}
            <div className="card-surface card-hover animate-card-pop-2 rounded-3xl p-6 border border-border/80 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-emerald-500/40">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{t('land.bookPers2Title')}</h3>
              <p className="mt-1.5 text-sm font-medium text-muted-foreground">
                {t('land.bookPers2Desc')}
              </p>
              <div className="mt-5 rounded-2xl bg-emerald-500/10 p-3.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {t('land.bookPers2LimitLabel')}
                </p>
                <p className="mt-1 text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  Rp 150.000 {t('land.calcPerDay')}
                </p>
              </div>
            </div>

            {/* Personal Card 3 */}
            <div className="card-surface card-hover animate-card-pop-3 rounded-3xl p-6 border border-border/80 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-violet-500/40">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{t('land.bookPers3Title')}</h3>
              <p className="mt-1.5 text-sm font-medium text-muted-foreground">
                {t('land.bookPers3Desc')}
              </p>
              <div className="mt-5 space-y-2 rounded-2xl bg-background p-3 text-xs">
                <div className="flex justify-between font-semibold">
                  <span>☕ Kopi & Dining</span>
                  <span className="font-bold text-amber-500">Rp 320.000</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>🍿 Entertainment</span>
                  <span className="font-bold text-violet-500">Rp 186.000</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {/* Business Card 1 */}
            <div className="card-surface card-hover animate-card-pop-1 rounded-3xl p-6 border border-border/80 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-emerald-500/40">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ArrowDownLeft className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{t('land.bookBiz1Title')}</h3>
              <p className="mt-1.5 text-sm font-medium text-muted-foreground">
                {t('land.bookBiz1Desc')}
              </p>
              <div className="mt-5 space-y-2 rounded-2xl bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                <div className="flex justify-between font-semibold">
                  <span>{t('land.bookBiz1Today')}</span>
                  <span className="font-extrabold">+Rp 2.450.000</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>{t('land.bookBiz1TotalTx')}</span>
                  <span className="font-bold">{t('land.bookBiz1SalesCount', { n: 48 })}</span>
                </div>
              </div>
            </div>

            {/* Business Card 2 */}
            <div className="card-surface card-hover animate-card-pop-2 rounded-3xl p-6 border border-border/80 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-amber-500/40">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <PackageCheck className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{t('land.bookBiz2Title')}</h3>
              <p className="mt-1.5 text-sm font-medium text-muted-foreground">
                {t('land.bookBiz2Desc')}
              </p>
              <div className="mt-5 space-y-2 rounded-2xl bg-background p-3 text-xs">
                <div className="flex justify-between font-semibold">
                  <span>Nasi Goreng Special</span>
                  <span className="font-bold text-positive">{t('land.bookBiz2ProfitNasi')}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Es Teh Manis</span>
                  <span className="font-bold text-positive">{t('land.bookBiz2ProfitTeh')}</span>
                </div>
              </div>
            </div>

            {/* Business Card 3 */}
            <div className="card-surface card-hover animate-card-pop-3 rounded-3xl p-6 border border-border/80 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-rose-500/40">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <UserCheck className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{t('land.bookBiz3Title')}</h3>
              <p className="mt-1.5 text-sm font-medium text-muted-foreground">
                {t('land.bookBiz3Desc')}
              </p>
              <div className="mt-5 space-y-2 rounded-2xl bg-background p-3 text-xs">
                <div className="flex justify-between font-semibold">
                  <span>Bu Sari (Warung)</span>
                  <span className="font-bold text-rose-500">{t('land.bookBiz3Debt', { amount: 'Rp 125.000' })}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Pak Ahmad</span>
                  <span className="font-bold text-emerald-500">{t('land.bookBiz3Paid')}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
