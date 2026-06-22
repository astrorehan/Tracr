import { Fragment, useEffect, useMemo, useState, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { preloadAllRoutes } from '@/lib/preloadRoutes'
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  ClipboardList,
  CalendarClock,
  HandCoins,
  Package,
  TrendingUp,
  Users,
  Settings,
  Plus,
  Sparkles,
  Moon,
  Sun,
  Search,
  FolderTree,
  Tags,
  Wand2,
  Coins,
  Database,
  Keyboard,
  Target,
  Receipt,
  PiggyBank,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MsgKey } from '@/i18n'
import type { TransactionType } from '@/types/db'
import { useT } from '@/features/settings/language-context'
import { useActiveBook } from '@/features/books/useActiveBook'
import { BookSwitcher } from '@/features/books/BookSwitcher'
import { PageSkeleton } from '@/components/ui/States'
import { PageBack } from '@/components/PageBack'
import { AppHeader } from '@/components/AppHeader'
import { useLiveRatesSync } from '@/features/fx/useLiveRatesSync'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import { AiProvider } from '@/features/ai/AiProvider'
import { useAi } from '@/features/ai/ai-context'
import { OfflineBanner } from '@/components/OfflineBanner'
import { useTheme } from '@/features/settings/theme-context'
import { CommandPalette } from '@/features/command-palette/CommandPalette'
import { ShortcutsHelp } from '@/features/command-palette/ShortcutsHelp'
import { useAppShortcuts } from '@/features/command-palette/useAppShortcuts'
import type { Command } from '@/features/command-palette/types'

type IconType = ComponentType<{ className?: string }>

type NavItem = {
  to: string
  label: MsgKey
  icon: IconType
  // Extra path prefixes that should also light this link up. Used by the
  // Rencana entry, which owns /budgets but stays active on /bills and /goals.
  match?: string[]
}

// Sidebar nav, split into visual groups. Budgets, Bills and Savings goals are
// folded into one "Rencana" tab, set apart in its own group by the dividers
// the renderer draws between groups.
const NAV_GROUPS: NavItem[][] = [
  [
    { to: '/', label: 'nav.home', icon: LayoutDashboard },
    { to: '/accounts', label: 'nav.accounts', icon: Wallet },
    { to: '/transactions', label: 'nav.activity', icon: ArrowLeftRight },
    { to: '/reports', label: 'nav.reports', icon: BarChart3 },
  ],
  [
    {
      to: '/budgets',
      label: 'nav.planning',
      icon: ClipboardList,
      match: ['/budgets', '/bills', '/goals'],
    },
    {
      to: '/installments',
      label: 'nav.installments',
      icon: CalendarClock,
    },
  ],
  [{ to: '/settings', label: 'nav.settings', icon: Settings }],
]

// Mobile dock slots, left to right.
//
// Every route in the app maps onto a nav slot via `match`. Without that the
// dock went dark the moment you opened anything outside the exact paths, which
// is most of the app. A slot owns the routes you reach from it: the planning
// and Buku Usaha pages are entered from the home tiles, so Home keeps them lit;
// Reports answers the same question as Activity.
//
// The last slot used to be Settings. It is the assistant now: asking about your
// money is a daily thing and it had no reachable entry point on a phone, while
// Settings is a place you visit rarely and every app on the phone keeps behind
// the avatar — which is where it lives, in the header, on every route.
type DockSlot =
  | { kind: 'nav'; item: NavItem }
  | { kind: 'record' }
  | { kind: 'ai' }

const DOCK: DockSlot[] = [
  {
    kind: 'nav',
    item: {
      to: '/',
      label: 'nav.home',
      icon: LayoutDashboard,
      match: [
        '/',
        '/budgets',
        '/bills',
        '/goals',
        '/installments',
        '/products',
        '/profit',
        '/debts',
        '/contacts',
      ],
    },
  },
  {
    kind: 'nav',
    item: { to: '/accounts', label: 'nav.accounts', icon: Wallet, match: ['/accounts', '/currencies'] },
  },
  { kind: 'record' },
  {
    kind: 'nav',
    item: {
      to: '/transactions',
      label: 'nav.activity',
      icon: ArrowLeftRight,
      match: ['/transactions', '/reports'],
    },
  },
  { kind: 'ai' },
]

// Mobile FAB speed-dial: three ways into the record form, each preselecting the
// money direction. Bottom-to-top so the first sits closest to the FAB.
const SPEED_ACTIONS: { type: TransactionType; label: MsgKey; icon: IconType; tint: string }[] = [
  { type: 'expense', label: 'common.expense', icon: ArrowUpRight, tint: 'text-negative' },
  { type: 'income', label: 'common.income', icon: ArrowDownLeft, tint: 'text-positive' },
  { type: 'transfer', label: 'common.transfer', icon: ArrowLeftRight, tint: 'text-primary' },
]

// Routes that share the Buku Usaha chrome (BizLayout). They animate as one
// group so tabbing between them doesn't replay the page fade on the shared
// header and tab bar.
const BIZ_PATHS = ['/products', '/debts', '/contacts', '/profit']

function animationKeyFor(pathname: string) {
  return BIZ_PATHS.some((p) => pathname.startsWith(p)) ? 'biz' : pathname
}

/** True when `pathname` sits under `prefix`. '/' matches only itself. */
function underPath(pathname: string, prefix: string) {
  return prefix === '/' ? pathname === '/' : pathname.startsWith(prefix)
}

function matchesItem(pathname: string, item: NavItem) {
  return (item.match ?? [item.to]).some((p) => underPath(pathname, p))
}

function mobileSlotFor(pathname: string) {
  return DOCK.findIndex((slot) => slot.kind === 'nav' && matchesItem(pathname, slot.item))
}

export function AppLayout() {
  return (
    <AiProvider>
      <AppShell />
    </AiProvider>
  )
}

function AppShell() {
  const [addOpen, setAddOpen] = useState(false)
  const [addType, setAddType] = useState<TransactionType>('expense')
  const [speedOpen, setSpeedOpen] = useState(false)
  const [speedClosing, setSpeedClosing] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const closeSpeedDial = (onComplete?: () => void) => {
    if (!speedOpen || speedClosing) return
    setSpeedClosing(true)
    setTimeout(() => {
      setSpeedOpen(false)
      setSpeedClosing(false)
      if (onComplete) onComplete()
    }, 200)
  }

  const toggleSpeedDial = () => {
    if (speedClosing) return
    if (speedOpen) {
      closeSpeedDial()
    } else {
      setSpeedOpen(true)
    }
  }
  const { activeBookId, activeBook, loading: booksLoading } = useActiveBook()
  const ai = useAi()
  const { t } = useT()
  const { theme, toggle } = useTheme()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isHome = pathname === '/'
  const activeSlot = mobileSlotFor(pathname)

  // Business books get POS-lite (products) + laba-rugi (profit) +
  // Utang-Piutang (debts) tools inserted into the last group.
  // Personal books get Utang-Piutang inserted in the planning group.
  const navGroups = useMemo(() => {
    const isBiz = activeBook?.type === 'business'
    const groups = NAV_GROUPS.map((g) => [...g])
    if (isBiz) {
      const last = groups[groups.length - 1]
      const at = last.findIndex((i) => i.to === '/settings')
      last.splice(
        at,
        0,
        { to: '/products', label: 'nav.products', icon: Package },
        { to: '/debts', label: 'debt.titleBusiness', icon: HandCoins },
        { to: '/contacts', label: 'ct.title', icon: Users },
        { to: '/profit', label: 'nav.profit', icon: TrendingUp },
      )
    } else {
      groups[1].push(
        { to: '/debts', label: 'debt.titlePersonal', icon: HandCoins },
        { to: '/contacts', label: 'ct.title', icon: Users },
      )
    }
    return groups
  }, [activeBook?.type])

  // Refresh FX rates from the free live sources once per session.
  useLiveRatesSync()

  // Preload all lazy route chunks in background during idle time so tab switches are instant.
  useEffect(() => {
    preloadAllRoutes()
  }, [])

  useAppShortcuts({
    openPalette: () => setPaletteOpen(true),
    quickAdd: () => setAddOpen(true),
    openHelp: () => setHelpOpen(true),
    navigate,
  })

  // Everything reachable from the palette: jump to a page, or run an action.
  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate(to)
    const navCommands: Command[] = [
      { id: 'nav-dashboard', label: 'Dashboard', group: 'Go to', icon: LayoutDashboard, keywords: 'home overview', shortcut: ['G', 'D'], perform: go('/') },
      { id: 'nav-accounts', label: 'Accounts', group: 'Go to', icon: Wallet, keywords: 'wallet balances', shortcut: ['G', 'A'], perform: go('/accounts') },
      { id: 'nav-activity', label: 'Activity', group: 'Go to', icon: ArrowLeftRight, keywords: 'transactions history feed', shortcut: ['G', 'T'], perform: go('/transactions') },
      { id: 'nav-reports', label: 'Reports', group: 'Go to', icon: BarChart3, keywords: 'analytics charts', shortcut: ['G', 'R'], perform: go('/reports') },
      { id: 'nav-budgets', label: 'Budgets', group: 'Go to', icon: Target, keywords: 'limits spending', shortcut: ['G', 'B'], perform: go('/budgets') },
      { id: 'nav-bills', label: 'Bills & subscriptions', group: 'Go to', icon: Receipt, keywords: 'recurring subscriptions', shortcut: ['G', 'I'], perform: go('/bills') },
      { id: 'nav-goals', label: 'Savings goals', group: 'Go to', icon: PiggyBank, keywords: 'piggy bank saving', shortcut: ['G', 'G'], perform: go('/goals') },
      { id: 'nav-categories', label: 'Categories', group: 'Go to', icon: FolderTree, keywords: 'organize', perform: go('/categories') },
      { id: 'nav-tags', label: 'Tags', group: 'Go to', icon: Tags, keywords: 'labels', perform: go('/tags') },
      { id: 'nav-rules', label: 'Rules', group: 'Go to', icon: Wand2, keywords: 'automation auto-categorize', perform: go('/rules') },
      { id: 'nav-currencies', label: 'Currencies', group: 'Go to', icon: Coins, keywords: 'fx exchange rates', perform: go('/currencies') },
      { id: 'nav-data', label: 'Data & backup', group: 'Go to', icon: Database, keywords: 'import export csv backup restore', perform: go('/data') },
      { id: 'nav-settings', label: 'Settings', group: 'Go to', icon: Settings, keywords: 'preferences profile', shortcut: ['G', 'S'], perform: go('/settings') },
    ]
    const actionCommands: Command[] = [
      { id: 'act-add', label: 'New transaction', group: 'Actions', icon: Plus, keywords: 'add log write expense income', shortcut: ['N'], perform: () => setAddOpen(true) },
      {
        id: 'act-theme',
        label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        group: 'Actions',
        icon: theme === 'dark' ? Sun : Moon,
        keywords: 'theme dark light appearance',
        perform: toggle,
      },
      { id: 'act-help', label: 'Keyboard shortcuts', group: 'Actions', icon: Keyboard, keywords: 'keys hotkeys help', shortcut: ['?'], perform: () => setHelpOpen(true) },
    ]
    return [...navCommands, ...actionCommands]
  }, [navigate, theme, toggle])

  // Hold the app until we know which book is active, so no child query fires
  // with a missing book_id and flashes empty data.
  if (booksLoading || !activeBookId) return <PageSkeleton />

  return (
    <div className="app-atmosphere relative flex min-h-screen w-full bg-background text-foreground">
      {/* ───────────────────────── Desktop / tablet sidebar ───────────────────────── */}
      <aside className="sticky top-0 z-30 hidden h-screen w-[84px] shrink-0 flex-col border-r border-border bg-surface px-4 py-5 sm:flex lg:w-[260px] print:hidden">
        {/* Brand */}
        <Link to="/" className="group mb-2 flex items-center gap-3 px-1.5 py-2">
          <img
            src="/Tracr.svg"
            alt="Tracr"
            className="h-9 w-9 rounded-xl border border-border shadow-sm transition-transform duration-300 group-hover:scale-105 group-active:scale-95"
          />
          <span className="font-wordmark hidden text-2xl font-bold tracking-tight lg:block">
            Tracr
          </span>
        </Link>

        {/* Book switcher */}
        <div className="mt-1">
          <BookSwitcher />
        </div>

        {/* Primary nav, drawn group by group with a divider between each so the
            Rencana tab reads as its own cluster. */}
        <nav className="mt-4 flex flex-1 flex-col gap-1.5">
          {navGroups.map((group, gi) => (
            <Fragment key={gi}>
              {gi > 0 && <div aria-hidden className="mx-2 my-1 h-px bg-border" />}
              {group.map((item) => (
                <SidebarLink key={item.to} {...item} />
              ))}
            </Fragment>
          ))}
        </nav>

        {/* Quick add */}
        <button
          onClick={() => {
            setAddType('expense')
            setAddOpen(true)
          }}
          className="pressable btn-sheen group mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-3 font-semibold text-primary-foreground transition-all duration-300 hover:brightness-[1.06]"
          aria-label={t('layout.recordTransaction')}
        >
          <Plus className="h-5 w-5 stroke-[2.5] transition-transform duration-300 group-hover:rotate-90" />
          <span className="hidden text-sm lg:inline">{t('layout.writeItDown')}</span>
        </button>
      </aside>

      {/* ───────────────────────── Main column ───────────────────────── */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        {/* One header for every route and every width — see AppHeader. */}
        <AppHeader />

        {/* Scrolling body. Every route shares one content width and one gutter so
            the left edge never shifts when you switch tabs. Home is the single
            exception below sm: it drops the horizontal padding so its gradient
            hero can bleed edge-to-edge, and supplies its own top gap (the hero's
            sm:mt-6) in place of pt-6. */}
        <main
          className={cn(
            'flex-1 pb-28 sm:pb-10',
            isHome ? 'sm:px-6 lg:px-8' : 'px-4 pt-6 sm:px-6 lg:px-8',
          )}
        >
          <div
            key={animationKeyFor(pathname)}
            className="mx-auto w-full max-w-[1280px]"
          >
            {/* One back control for the whole shell, in the same spot on every
                route (Home is the root, so PageBack renders nothing there). */}
            <PageBack className="mb-4 print:hidden" />
            <Outlet />
          </div>
        </main>
      </div>

      {/* ───────────────────────── Mobile bottom tab bar ─────────────────────────
          Floating pill dock: 5 slots, icons only, a gradient indicator that
          slides between them, and the raised gradient Record button in the
          middle slot. */}
      {/* Geometry is px, never rem: the text-size setting scales the root font
          size, which would otherwise inflate the whole bar on the larger steps. */}
      <nav
        className="dock-shadow fixed inset-x-[16px] z-40 rounded-[24px] border border-border bg-surface sm:hidden print:hidden"
        style={{ bottom: 'calc(24px + env(safe-area-inset-bottom))' }}
      >
        {/* No horizontal padding on the grid: each column is exactly a fifth of
            the bar, which is what the indicator's `w-1/5` + translate assumes. */}
        <div className="relative grid grid-cols-5 py-[5px]">
          {/* Sliding active indicator — a squircle that hugs just the icon, so a
              long label (e.g. "Pengaturan") is never clipped by the pill. Parked
              under the center slot and faded out when no tab matches, so it never
              animates in from a corner. Decelerating ease only — no overshoot. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-[6px] left-0 flex w-1/5 justify-center transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)]"
            style={{
              transform: `translateX(${(activeSlot < 0 ? 2 : activeSlot) * 100}%)`,
              opacity: activeSlot < 0 ? 0 : 1,
            }}
          >
            <span className="brand-gradient block h-[24px] w-[42px] rounded-[13px] shadow-sm shadow-primary/40" />
          </span>

          {DOCK.map((slot, i) => {
            if (slot.kind === 'nav')
              return <MobileNavLink key={slot.item.to} {...slot.item} active={i === activeSlot} />
            if (slot.kind === 'ai') return <DockAiButton key="ai" onClick={() => ai.open()} />
            // Spacer column — the Record button is absolutely centered over it.
            return <div key="record" aria-hidden className="h-[46px]" />
          })}
        </div>

        {/* Speed-dial: the three record directions, stacked above the FAB. */}
        {(speedOpen || speedClosing) && (
          <div className="absolute bottom-[84px] left-1/2 z-10 flex -translate-x-1/2 flex-col items-stretch gap-2">
            {SPEED_ACTIONS.map((a, i) => (
              <button
                key={a.type}
                onClick={() => {
                  closeSpeedDial(() => {
                    setAddType(a.type)
                    setAddOpen(true)
                  })
                }}
                style={{
                  animationDelay: speedClosing
                    ? `${i * 35}ms`
                    : `${(SPEED_ACTIONS.length - 1 - i) * 40}ms`,
                }}
                className={cn(
                  'pressable dock-shadow flex items-center gap-2.5 whitespace-nowrap rounded-full border border-border bg-surface py-2.5 pl-3 pr-5 text-sm font-bold text-foreground transition-transform',
                  speedClosing ? 'animate-rise-out' : 'animate-rise',
                )}
              >
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted', a.tint)}>
                  <a.icon className="h-[18px] w-[18px]" />
                </span>
                {t(a.label)}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={toggleSpeedDial}
          aria-expanded={speedOpen && !speedClosing}
          className="fab-record pressable group absolute left-1/2 top-0 z-10 flex h-[60px] w-[60px] -translate-x-1/2 -translate-y-[17px] items-center justify-center rounded-[19px] text-white ring-[3px] ring-surface transition-transform duration-300 hover:scale-105 active:scale-95"
          aria-label={t('layout.recordTransaction')}
        >
          <Plus
            className={cn(
              'h-[28px] w-[28px] stroke-[2.75] transition-transform duration-300',
              speedOpen && !speedClosing ? 'rotate-[135deg]' : 'group-active:rotate-90',
            )}
          />
        </button>
      </nav>

      {/* Scrim: tap-away to close the speed-dial (mobile only). */}
      {(speedOpen || speedClosing) && (
        <button
          aria-hidden
          tabIndex={-1}
          onClick={() => closeSpeedDial()}
          className={cn(
            'fixed inset-0 z-30 bg-black/40 sm:hidden print:hidden',
            speedClosing ? 'animate-fade-out' : 'animate-fade-in',
          )}
        />
      )}

      <TransactionForm
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultType={addType}
      />
      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} commands={commands} />
      )}
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

/**
 * The dock's assistant slot. A button, not a tab: it opens the chat in place
 * instead of navigating, so it stays out of the sliding indicator. The soft
 * pill marks it as the accent action without imitating the solid gradient the
 * indicator uses for "you are here".
 */
function DockAiButton({ onClick }: { onClick: () => void }) {
  const { t } = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('layout.askAi')}
      className="pressable relative flex h-[46px] w-full flex-col items-center gap-[4px] px-0.5 pt-[3px]"
    >
      {/* Same 20px icon box as the tabs, so the labels sit on one line. The
          halo is drawn outside that box and marks the slot as the accent
          action without imitating the indicator's solid gradient. */}
      <span className="relative flex h-[20px] w-[20px] items-center justify-center">
        <span aria-hidden className="absolute inset-[-5px] rounded-full bg-primary/12" />
        <Sparkles className="relative h-[20px] w-[20px] text-primary" />
      </span>
      <span className="max-w-full truncate text-[10px] font-semibold leading-[14px] text-primary">
        {t('nav.ask')}
      </span>
    </button>
  )
}

function SidebarLink({ to, label, icon: Icon, match }: NavItem) {
  const { t } = useT()
  const { pathname } = useLocation()
  // A link with `match` owns several routes, so decide active ourselves; plain
  // links fall back to NavLink's own path matching.
  const matched = match ? matchesItem(pathname, { to, label, icon: Icon, match }) : undefined
  return (
    <NavLink to={to} end={to === '/'}>
      {({ isActive }) => {
        const active = matched ?? isActive
        return (
          <span
            className={cn(
              'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200',
              'justify-center lg:justify-start',
              active
                ? 'bg-primary-soft text-primary'
                : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
            )}
          >
            <Icon className="h-5 w-5 shrink-0 transition-transform duration-300 group-hover:scale-110" />
            <span className="hidden lg:inline">{t(label)}</span>
          </span>
        )
      }}
    </NavLink>
  )
}

// Dock tab: icon over a text label. Abstract icons alone left people guessing
// which tab was which, so the word carries the meaning and the icon is decor.
// `relative` keeps it painting above the absolutely positioned indicator that
// slides in behind it. Active state is passed down rather than taken from
// NavLink, because a slot also lights up for the routes it owns via `match`.
function MobileNavLink({
  to,
  label,
  icon: Icon,
  active,
}: NavItem & { active: boolean }) {
  const { t } = useT()
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className="relative flex h-[46px] w-full flex-col items-center gap-[4px] px-0.5 pt-[3px]"
    >
      {/* Icon sits over the gradient squircle → white; the label lives below it
          on the bar, so it stays its own colour and never disappears. */}
      <Icon
        className={cn(
          'h-[20px] w-[20px] shrink-0 transition-[color,transform] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] active:scale-90',
          active ? 'text-white' : 'text-muted-foreground',
        )}
      />
      {/* px, not rem: the text-size setting scales the root font size, which
          would otherwise wrap these labels and blow out the bar height. */}
      <span
        className={cn(
          // leading must clear descenders (g/p): `truncate` clips overflow, so a
          // tight line-box would shave the tails off "Pengaturan"/"Dompet".
          'max-w-full truncate text-[10px] font-semibold leading-[14px] transition-colors duration-300',
          active ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {t(label)}
      </span>
    </NavLink>
  )
}
