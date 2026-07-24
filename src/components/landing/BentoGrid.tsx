import {
  Send,
  Wallet,
  Sparkles,
  Smartphone,
  UserCheck,
} from 'lucide-react'
import { useT } from '@/features/settings/language-context'

export function BentoGrid() {
  const { t } = useT()

  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-12 px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t('land.bentoTitle')}
        </h2>
        <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
          {t('land.bentoSub')}
        </p>
      </div>

      {/* 6-Item Bento Grid */}
      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Item 1: Telegram Bot (Span 2 cols on desktop) */}
        <div className="group card-surface card-hover lg:col-span-2 relative overflow-hidden rounded-3xl p-8 border border-border/80 flex flex-col justify-between">
          <div className="landing-drift pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-sky-500/10 blur-2xl transition group-hover:bg-sky-500/20" />
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400 transition-transform duration-300 group-hover:scale-110">
              <Send className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-xl font-bold">{t('land.b1Title')}</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-muted-foreground max-w-lg">
              {t('land.b1Desc')}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-sky-600 dark:text-sky-400">
            <span className="rounded-lg bg-sky-500/10 px-3 py-1.5">{t('land.b1Chip1')}</span>
            <span className="rounded-lg bg-sky-500/10 px-3 py-1.5">{t('land.b1Chip2')}</span>
            <span className="rounded-lg bg-sky-500/10 px-3 py-1.5">{t('land.b1Chip3')}</span>
          </div>
        </div>

        {/* Item 2: Multi-Account */}
        <div className="group card-surface card-hover relative overflow-hidden rounded-3xl p-8 border border-border/80 flex flex-col justify-between">
          <div className="landing-drift pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-2xl transition group-hover:bg-emerald-500/20" />
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 transition-transform duration-300 group-hover:scale-110">
              <Wallet className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-xl font-bold">{t('land.b2Title')}</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-muted-foreground">
              {t('land.b2Desc')}
            </p>
          </div>
          <div className="mt-6 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {t('land.b2Chip')}
          </div>
        </div>

        {/* Item 3: AI Copilot */}
        <div className="group card-surface card-hover relative overflow-hidden rounded-3xl p-8 border border-border/80 flex flex-col justify-between">
          <div className="landing-drift pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-500/10 blur-2xl transition group-hover:bg-violet-500/20" />
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-600 dark:text-violet-400 transition-transform duration-300 group-hover:scale-110">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-xl font-bold">{t('land.b3Title')}</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-muted-foreground">
              {t('land.b3Desc')}
            </p>
          </div>
          <div className="mt-6 text-xs font-semibold text-violet-600 dark:text-violet-400">
            {t('land.b3Chip')}
          </div>
        </div>

        {/* Item 4: Offline-First PWA */}
        <div className="group card-surface card-hover relative overflow-hidden rounded-3xl p-8 border border-border/80 flex flex-col justify-between">
          <div className="landing-drift pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/10 blur-2xl transition group-hover:bg-amber-500/20" />
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 transition-transform duration-300 group-hover:scale-110">
              <Smartphone className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-xl font-bold">{t('land.b4Title')}</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-muted-foreground">
              {t('land.b4Desc')}
            </p>
          </div>
          <div className="mt-6 text-xs font-semibold text-amber-600 dark:text-amber-400">
            {t('land.b4Chip')}
          </div>
        </div>

        {/* Item 5: Piutang & Debt Tracker */}
        <div className="group card-surface card-hover relative overflow-hidden rounded-3xl p-8 border border-border/80 flex flex-col justify-between">
          <div className="landing-drift pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-rose-500/10 blur-2xl transition group-hover:bg-rose-500/20" />
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 transition-transform duration-300 group-hover:scale-110">
              <UserCheck className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-xl font-bold">{t('land.b5Title')}</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-muted-foreground">
              {t('land.b5Desc')}
            </p>
          </div>
          <div className="mt-6 text-xs font-semibold text-rose-600 dark:text-rose-400">
            {t('land.b5Chip')}
          </div>
        </div>
      </div>
    </section>
  )
}
