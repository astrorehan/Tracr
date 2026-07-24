import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { useT } from '@/features/settings/language-context'
import { LANGS, type Lang, type MsgKey } from '@/i18n'
import { Globe } from 'lucide-react'

import { HeroSection } from '@/components/landing/HeroSection'
import { TelegramSimulator } from '@/components/landing/TelegramSimulator'
import { BookToggleSection } from '@/components/landing/BookToggleSection'
import { SafeToSpendCalculator } from '@/components/landing/SafeToSpendCalculator'
import { BentoGrid } from '@/components/landing/BentoGrid'
import { BeforeAfterComparison } from '@/components/landing/BeforeAfterComparison'
import { PwaInstallBanner } from '@/components/landing/PwaInstallBanner'
import { PrivacyFooter } from '@/components/landing/PrivacyFooter'

const MARQUEE_ITEMS: MsgKey[] = [
  'land.tickerAccounts',
  'land.tickerBudgets',
  'land.tickerBills',
  'land.tickerGoals',
  'land.tickerReports',
  'land.tickerCurrencies',
  'land.tickerTags',
  'land.tickerAi',
  'land.tickerBot',
  'land.tickerOffline',
]

export function LandingPage() {
  const { session } = useAuth()
  const { t, lang, setLang } = useT()
  const ctaTo = session ? '/' : '/login'

  const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.history.pushState(null, '', `#${id}`)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-sky-500 selection:text-white">
      {/* Top Header / Navigation Bar */}
      <header className="brand-hero relative overflow-hidden text-white">
        {/* Ambient glowing blobs */}
        <div className="landing-drift pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="landing-drift landing-drift-delay pointer-events-none absolute -right-16 top-2/3 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />

        {/* Navigation */}
        <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-md">
              <img src="/logo.svg" alt="Tracr Logo" className="h-6 w-6" />
            </div>
            <span className="font-display text-2xl font-extrabold tracking-tight text-white">
              Tracr
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="#features"
              onClick={(e) => handleScrollTo(e, 'features')}
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition hover:text-white sm:block"
            >
              {t('nav.features')}
            </a>
            <a
              href="#telegram-demo"
              onClick={(e) => handleScrollTo(e, 'telegram-demo')}
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition hover:text-white sm:block"
            >
              {t('nav.telegramBot')}
            </a>
            <a
              href="#calculator"
              onClick={(e) => handleScrollTo(e, 'calculator')}
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition hover:text-white sm:block"
            >
              {t('nav.calculator')}
            </a>

            {/* Language Picker */}
            <div className="flex items-center gap-1 rounded-xl border border-white/25 bg-white/10 px-2.5 py-1.5 backdrop-blur-md">
              <Globe className="h-3.5 w-3.5 text-white/90" />
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                {LANGS.map((l) => (
                  <option key={l.value} value={l.value} className="text-foreground bg-background">
                    {l.value.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <Link
              to={ctaTo}
              className="pressable rounded-xl border border-white/30 bg-white/15 px-4 py-2 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/25 active:scale-95"
            >
              {t(session ? 'land.openApp' : 'land.signIn')}
            </Link>
          </div>
        </nav>

        {/* Hero Section */}
        <HeroSection ctaTo={ctaTo} />
      </header>

      {/* Feature Marquee Ticker */}
      <div className="overflow-hidden border-b border-border bg-surface py-3.5 shadow-xs">
        <div className="flex w-max animate-marquee gap-8 hover:[animation-play-state:paused]">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((key, i) => (
            <span
              key={i}
              className="flex items-center gap-8 whitespace-nowrap text-xs sm:text-sm font-bold tracking-wide text-muted-foreground uppercase"
            >
              {t(key)} <span className="text-sky-500">•</span>
            </span>
          ))}
        </div>
      </div>

      {/* Telegram Interactive Simulator */}
      <TelegramSimulator />

      {/* Personal vs Business Book Toggle */}
      <BookToggleSection />

      {/* Safe-to-Spend Calculator */}
      <SafeToSpendCalculator />

      {/* 6-Item Bento Grid */}
      <BentoGrid />

      {/* Before & After Comparison */}
      <BeforeAfterComparison />

      {/* PWA Quick Install Banner */}
      <PwaInstallBanner />

      {/* Security & Footer */}
      <PrivacyFooter ctaTo={ctaTo} />
    </div>
  )
}
