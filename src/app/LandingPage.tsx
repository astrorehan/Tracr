import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarClock,
  Check,
  Coffee,
  Coins,
  Home,
  PieChart,
  PiggyBank,
  ReceiptText,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Wallet,
} from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

/* Public marketing front door (/welcome). Signed-in visitors skip straight to
   the dashboard; everyone else gets the pitch. Copy stays plain-language —
   no finance jargon — and every color comes from the theme tokens so the page
   works in both light and dark for free. */

const MARQUEE_ITEMS = [
  'Accounts',
  'Budgets',
  'Bills',
  'Goals',
  'Reports',
  'Multi-currency',
  'Tags & rules',
  'AI insights',
  'Telegram bot',
  'Works offline',
]

const FEATURES: {
  icon: typeof Wallet
  chip: string
  title: string
  body: string
}[] = [
  {
    icon: Wallet,
    chip: 'bg-chip-blue-bg text-chip-blue-fg',
    title: 'Every account, one screen',
    body: 'Cash, bank cards, e-wallets — even crypto and stocks. Your total updates by itself.',
  },
  {
    icon: PiggyBank,
    chip: 'bg-chip-green-bg text-chip-green-fg',
    title: 'Budgets that keep up',
    body: 'Set a monthly limit per category and watch the bar fill up before you overspend.',
  },
  {
    icon: CalendarClock,
    chip: 'bg-chip-orange-bg text-chip-orange-fg',
    title: 'Never miss a bill',
    body: 'Rent, subscriptions, installments — Tracr remembers the due dates so you don’t have to.',
  },
  {
    icon: Target,
    chip: 'bg-chip-violet-bg text-chip-violet-fg',
    title: 'Goals you can see',
    body: 'Saving for a laptop or a trip? Put money aside and watch the ring close in.',
  },
  {
    icon: BarChart3,
    chip: 'bg-chip-blue-bg text-chip-blue-fg',
    title: 'Reports without spreadsheets',
    body: 'See where the money went each month in simple charts, not exported CSV homework.',
  },
  {
    icon: Coins,
    chip: 'bg-chip-green-bg text-chip-green-fg',
    title: 'Currencies and books',
    body: 'Rupiah, dollars, anything. Keep separate books for personal and business money.',
  },
]

/* Fires once when the element scrolls into view — powers the section reveals
   below the fold. The global prefers-reduced-motion rule collapses the
   animation itself, so this only ever gates *when*, not *whether*. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, inView }
}

/** Scroll-triggered rise-in wrapper; `delay` staggers siblings. */
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const { ref, inView } = useInView<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={cn(inView ? 'animate-rise' : 'opacity-0', className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

/* Balance in the phone mock counts up on load — the number doing the work
   sells "your total updates by itself" better than a static figure. */
function AnimatedBalance({ target = 12480000 }: { target?: number }) {
  // Reduced-motion users get the final figure straight away.
  const [value, setValue] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? target : 0,
  )
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const t0 = performance.now()
    const duration = 1400
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return <>Rp {value.toLocaleString('id-ID')}</>
}

export function LandingPage() {
  // Signed-in visitors can still read the page — the CTAs just point at the
  // dashboard instead of the login form.
  const { session } = useAuth()
  const ctaTo = session ? '/' : '/login'

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Hero — the one big blue surface, same weave as the balance card ── */}
      <header className="brand-hero relative overflow-hidden text-white">
        {/* Drifting glow blobs — atmosphere behind the weave */}
        <div className="landing-drift pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="landing-drift landing-drift-delay pointer-events-none absolute -right-16 top-2/3 h-80 w-80 rounded-full bg-brand-bright/25 blur-3xl" />

        {/* Nav */}
        <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm">
              <img src="/logo.svg" alt="" className="h-6 w-6" />
            </div>
            <span className="font-['Space_Grotesk_Variable'] text-xl font-bold tracking-tight">
              Tracr
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="#features"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition hover:text-white sm:block"
            >
              Features
            </a>
            <a
              href="#telegram"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition hover:text-white sm:block"
            >
              Telegram
            </a>
            <Link
              to={ctaTo}
              className="pressable rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              {session ? 'Open app' : 'Sign in'}
            </Link>
          </div>
        </nav>

        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-10 lg:grid-cols-2 lg:gap-8 lg:pt-16">
          {/* Pitch */}
          <div className="max-w-xl">
            <p className="animate-rise stagger-1 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white/90">
              <Sparkles className="h-3.5 w-3.5" /> Free personal finance app
            </p>
            <h1 className="animate-rise stagger-2 mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              All your money,
              <br />
              one clear picture.
            </h1>
            <p className="animate-rise stagger-3 mt-5 text-base font-medium leading-relaxed text-white/85 sm:text-lg">
              Cash, bank, e-wallets — Tracr keeps every rupiah in one simple app. Log a purchase in
              seconds, even straight from Telegram.
            </p>
            <div className="animate-rise stagger-4 mt-8 flex flex-wrap items-center gap-3">
              <Link
                to={ctaTo}
                className="group pressable inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-base font-bold text-[#0072bc] shadow-md transition hover:bg-white/90"
              >
                {session ? 'Open your dashboard' : 'Start free'}{' '}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <a
                href="#features"
                className="pressable inline-flex h-12 items-center rounded-xl border border-white/25 bg-white/10 px-6 text-base font-semibold text-white transition hover:bg-white/15"
              >
                See what&apos;s inside
              </a>
            </div>
            <ul className="animate-rise stagger-5 mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-white/80">
              {['Free to use', 'No card needed', 'Works offline'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4" /> {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Phone mock + floating cards */}
          <div className="animate-rise stagger-3 relative mx-auto w-[300px] sm:w-[330px]">
            <PhoneMock />

            {/* Telegram bot ping */}
            <div className="landing-float absolute -right-4 -top-9 z-20 w-52 rounded-2xl card-surface p-3 text-foreground sm:-right-16">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                <Send className="h-3 w-3 text-primary" /> Tracr Bot · Telegram
              </div>
              <p className="mt-2 w-fit rounded-xl rounded-br-sm bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground">
                kopi 25k
              </p>
              <p className="mt-1.5 rounded-xl rounded-bl-sm bg-surface-muted px-2.5 py-1.5 text-xs font-medium">
                ✓ Saved — Coffee, Rp 25.000
              </p>
            </div>

            {/* AI insight */}
            <div className="landing-float landing-float-delay ai-rim absolute -bottom-6 -left-4 z-20 w-56 rounded-2xl bg-surface p-3.5 text-foreground shadow-md sm:-left-16">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary">
                <Sparkles className="h-3.5 w-3.5" /> AI insight
              </div>
              <p className="mt-1.5 text-xs font-medium leading-relaxed text-muted-foreground">
                You spent <span className="font-bold text-positive">12% less on food</span> this
                week. Nice pace 👍
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Feature ticker ── */}
      <div className="overflow-hidden border-b border-border bg-surface py-3.5">
        <div className="flex w-max animate-marquee gap-8 hover:[animation-play-state:paused]">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span
              key={i}
              className="flex items-center gap-8 whitespace-nowrap text-sm font-bold text-muted-foreground"
            >
              {item} <span className="text-primary">•</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-20 sm:py-24">
        <Reveal className="max-w-2xl">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Everything your money does, in plain sight
          </h2>
          <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
            No accountant words, no setup homework. Open it, add an account, start logging.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, chip, title, body }, i) => (
            <Reveal key={title} delay={i * 80}>
              <div className="group card-surface card-hover h-full rounded-[20px] p-6">
                <div
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110',
                    chip,
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold">{title}</h3>
                <p className="mt-1.5 text-sm font-medium leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Telegram + AI ── */}
      <section id="telegram" className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 sm:py-24 lg:grid-cols-2">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <Send className="h-3.5 w-3.5" /> Telegram bot
            </p>
            <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Log it from the chat you already use
            </h2>
            <p className="mt-4 text-base font-medium leading-relaxed text-muted-foreground">
              Bought something on the go? Text the Tracr bot like you&apos;d text a friend. It
              understands, files the expense, and answers questions about your spending — no need
              to open the app at all.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Type “lunch 35k” and it’s saved to the right category.',
                'Ask “how much on food this week?” and get a straight answer.',
                'The AI only reads your numbers when you ask it something.',
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-sm font-medium leading-relaxed">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-chip-green-bg text-chip-green-fg">
                    <Check className="h-3 w-3" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>

          <ChatMock />
        </div>
      </section>

      {/* ── How to start + PWA ── */}
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <Reveal className="max-w-2xl">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Up and running in a minute
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            {
              step: '1',
              title: 'Sign in with Google',
              body: 'One tap. No new password to remember, no card, no trial countdown.',
            },
            {
              step: '2',
              title: 'Add your accounts',
              body: 'Cash in your pocket, the bank card, GoPay — type in what’s in each today.',
            },
            {
              step: '3',
              title: 'Log as you go',
              body: 'From the app or from Telegram. Tracr does the math and the charts.',
            },
          ].map(({ step, title, body }, i) => (
            <Reveal key={step} delay={i * 120}>
              <div className="card-surface card-hover h-full rounded-[20px] p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft font-display text-sm font-extrabold text-primary">
                  {step}
                </span>
                <h3 className="mt-4 text-base font-bold">{title}</h3>
                <p className="mt-1.5 text-sm font-medium leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal
          delay={200}
          className="card-surface mt-6 flex flex-col items-start gap-4 rounded-[20px] p-6 sm:flex-row sm:items-center"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip-violet-bg text-chip-violet-fg">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold">No app store needed</h3>
            <p className="mt-1 text-sm font-medium leading-relaxed text-muted-foreground">
              Open Tracr in your phone&apos;s browser, tap <b>Add to Home Screen</b>, and it launches
              full-screen like a real app — even with spotty internet.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── Privacy ── */}
      <section className="border-t border-border bg-surface">
        <Reveal className="mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-chip-green-bg text-chip-green-fg">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            Only you can see your money notes
          </h2>
          <p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
            Your data is locked to your own login — not sold, not shared, not shown to anyone else.
            Export everything or delete your account any time.
          </p>
        </Reveal>
      </section>

      {/* ── Final CTA ── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
        <div className="brand-gradient relative overflow-hidden rounded-[28px] px-8 py-14 text-center text-white shadow-lg sm:py-16">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Start seeing your money clearly
          </h2>
          <p className="mx-auto mt-3 max-w-md text-base font-medium text-white/85">
            Takes a minute to set up. Costs nothing. Feels great by payday.
          </p>
          <Link
            to={ctaTo}
            className="group pressable mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-7 text-base font-bold text-[#0072bc] shadow-md transition hover:bg-white/90"
          >
            {session ? 'Open your dashboard' : 'Get started — it’s free'}{' '}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="" className="h-6 w-6" />
            <span className="font-wordmark text-lg font-bold">Tracr</span>
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            © {new Date().getFullYear()} Tracr · Made in Indonesia 🇮🇩
          </p>
          <div className="flex items-center gap-5 text-xs font-semibold text-muted-foreground">
            <Link to="/legal/terms" className="transition hover:text-foreground">
              Terms
            </Link>
            <Link to="/legal/privacy" className="transition hover:text-foreground">
              Privacy
            </Link>
            <Link to="/login" className="transition hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* Chat replay — bubbles land one by one once the card scrolls into view, with
   the bot "typing" before its answer. Sells the bot as a conversation, not a
   command line. */
function ChatMock() {
  const { ref, inView } = useInView<HTMLDivElement>()
  const [answered, setAnswered] = useState(false)

  useEffect(() => {
    if (!inView) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(() => setAnswered(true), reduced ? 0 : 2600)
    return () => clearTimeout(t)
  }, [inView])

  // Shared per-bubble reveal: hidden until the card is on screen, then each
  // message rises in on its own delay.
  const bubble = (delay: number) => ({
    className: inView ? 'animate-msg' : 'opacity-0',
    style: inView ? { animationDelay: `${delay}ms` } : undefined,
  })

  return (
    <div ref={ref} className="card-surface mx-auto w-full max-w-md rounded-[24px] p-5">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-full text-white">
          <Send className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-sm font-bold">Tracr Bot</p>
          <p className="text-xs font-medium text-positive">online</p>
        </div>
      </div>
      <div className="min-h-[13rem] space-y-3 pt-4 text-sm font-medium">
        <p
          style={bubble(100).style}
          className={cn(
            'ml-auto w-fit max-w-[75%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-primary-foreground',
            bubble(100).className,
          )}
        >
          makan siang 35k pakai gopay
        </p>
        <div
          style={bubble(800).style}
          className={cn(
            'w-fit max-w-[80%] rounded-2xl rounded-bl-md bg-surface-muted px-3.5 py-2',
            bubble(800).className,
          )}
        >
          ✓ Saved <span className="font-bold">Rp 35.000</span> — Food &amp; Drink, from GoPay 🍚
        </div>
        <p
          style={bubble(1600).style}
          className={cn(
            'ml-auto w-fit max-w-[75%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-primary-foreground',
            bubble(1600).className,
          )}
        >
          how much did I spend this week?
        </p>
        {answered ? (
          <div className="animate-msg w-fit max-w-[80%] rounded-2xl rounded-bl-md bg-surface-muted px-3.5 py-2">
            About <span className="font-bold">Rp 214.000</span> so far — mostly food. That&apos;s
            12% less than last week 👍
          </div>
        ) : (
          inView && (
            <div
              className="animate-msg flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-surface-muted px-3.5 py-3"
              style={{ animationDelay: '2100ms' }}
            >
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

/* Static dashboard replica — pure markup, no data. Mirrors the real Home
   screen (brand-hero balance card, quick-action chips, today's list) so the
   hero shows the actual product, not an illustration. */
function PhoneMock() {
  return (
    <div className="relative z-10 rounded-[2.4rem] border border-white/25 bg-white/10 p-2 shadow-lg">
      <div className="overflow-hidden rounded-[1.9rem] bg-background text-foreground">
        {/* Status bar */}
        <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[10px] font-bold text-muted-foreground">
          <span>09:41</span>
          <span className="h-4 w-16 rounded-full bg-surface-muted" />
          <span>●●●</span>
        </div>

        <div className="space-y-3.5 px-4 pb-4 pt-2">
          {/* Greeting */}
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground">Good morning</p>
              <p className="text-sm font-extrabold">Hai, Rai 👋</p>
            </div>
            <div className="brand-gradient flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-extrabold text-white">
              R
            </div>
          </div>

          {/* Balance hero */}
          <div className="brand-hero animate-rise stagger-2 relative overflow-hidden rounded-2xl p-4 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/75">
              Total balance
            </p>
            <p className="font-numeric mt-1 whitespace-nowrap text-xl font-extrabold tracking-tight sm:text-[1.4rem]">
              <AnimatedBalance />
            </p>
            <p className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-white/85">
              <ArrowUpRight className="h-3 w-3" /> +Rp 1.240.000 this month
            </p>
          </div>

          {/* Quick actions */}
          <div className="animate-rise stagger-3 grid grid-cols-4 gap-2 text-center text-[9px] font-bold text-muted-foreground">
            {(
              [
                [ArrowDownLeft, 'bg-chip-green-bg text-chip-green-fg', 'Income'],
                [ArrowUpRight, 'bg-chip-orange-bg text-chip-orange-fg', 'Expense'],
                [ArrowLeftRight, 'bg-chip-blue-bg text-chip-blue-fg', 'Transfer'],
                [Sparkles, 'bg-chip-violet-bg text-chip-violet-fg', 'Ask AI'],
              ] as const
            ).map(([Icon, chip, label]) => (
              <div key={label} className="space-y-1">
                <div
                  className={cn(
                    'mx-auto flex h-9 w-9 items-center justify-center rounded-xl',
                    chip,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <p>{label}</p>
              </div>
            ))}
          </div>

          {/* Today */}
          <div className="card-surface animate-rise stagger-4 rounded-2xl p-3">
            <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Today
            </p>
            <div className="space-y-2.5">
              <MockRow
                icon={Coffee}
                chip="bg-chip-orange-bg text-chip-orange-fg"
                title="Morning coffee"
                sub="Cash · 09:12"
                amount="-Rp 25.000"
                amountClass="text-negative"
              />
              <MockRow
                icon={Banknote}
                chip="bg-chip-green-bg text-chip-green-fg"
                title="Salary"
                sub="Bank · 08:00"
                amount="+Rp 8.500.000"
                amountClass="text-positive"
              />
              <MockRow
                icon={ArrowLeftRight}
                chip="bg-chip-blue-bg text-chip-blue-fg"
                title="Top up e-wallet"
                sub="BCA → GoPay"
                amount="Rp 200.000"
                amountClass="text-muted-foreground"
              />
            </div>
          </div>

          {/* Bottom nav */}
          <div className="flex items-center justify-around rounded-2xl border border-border bg-surface px-2 py-2.5 text-muted-foreground">
            <Home className="h-4 w-4 text-primary" />
            <ReceiptText className="h-4 w-4" />
            <PieChart className="h-4 w-4" />
            <Settings className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  )
}

function MockRow({
  icon: Icon,
  chip,
  title,
  sub,
  amount,
  amountClass,
}: {
  icon: typeof Coffee
  chip: string
  title: string
  sub: string
  amount: string
  amountClass: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', chip)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold">{title}</p>
        <p className="text-[10px] font-medium text-muted-foreground">{sub}</p>
      </div>
      <p className={cn('font-numeric text-xs font-bold', amountClass)}>{amount}</p>
    </div>
  )
}
