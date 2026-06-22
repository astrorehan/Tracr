import { useMemo, useState, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  BarChart3,
  Target,
  Receipt,
  PiggyBank,
  Settings,
  Plus,
  Moon,
  Sun,
  Search,
  FolderTree,
  Tags,
  Wand2,
  Coins,
  Database,
  Keyboard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/useAuth'
import { useTheme } from '@/features/settings/theme-context'
import { useLiveRatesSync } from '@/features/fx/useLiveRatesSync'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { CommandPalette } from '@/features/command-palette/CommandPalette'
import { ShortcutsHelp } from '@/features/command-palette/ShortcutsHelp'
import { useAppShortcuts } from '@/features/command-palette/useAppShortcuts'
import type { Command } from '@/features/command-palette/types'

type IconType = ComponentType<{ className?: string }>

const NAV: { to: string; label: string; icon: IconType }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/transactions', label: 'Activity', icon: ArrowLeftRight },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/budgets', label: 'Budgets', icon: Target },
  { to: '/bills', label: 'Bills', icon: Receipt },
  { to: '/goals', label: 'Goals', icon: PiggyBank },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const SECTION_TITLES: Record<string, string> = {
  '/': 'Overview',
  '/accounts': 'Accounts',
  '/transactions': 'Activity',
  '/reports': 'Reports',
  '/budgets': 'Budgets',
  '/bills': 'Bills & subscriptions',
  '/goals': 'Savings goals',
  '/settings': 'Settings',
  '/categories': 'Categories',
  '/tags': 'Tags',
  '/currencies': 'Currencies',
  '/data': 'Data & backup',
}

export function AppLayout() {
  const [addOpen, setAddOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const { profile } = useAuth()
  const { theme, toggle } = useTheme()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const section = SECTION_TITLES[pathname] ?? 'Workspace'

  // Refresh FX rates from the free live sources once per session.
  useLiveRatesSync()

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

  return (
    <div className="app-atmosphere relative flex min-h-screen w-full bg-background text-foreground">
      {/* ───────────────────────── Desktop / tablet sidebar ───────────────────────── */}
      <aside className="sticky top-0 z-30 hidden h-screen w-[84px] shrink-0 flex-col border-r border-border bg-surface/70 px-4 py-5 backdrop-blur-xl sm:flex lg:w-[260px] print:hidden">
        {/* Brand */}
        <Link to="/" className="group mb-2 flex items-center gap-3 px-1.5 py-2">
          <img
            src="/logo.svg"
            alt="Tracr"
            className="h-9 w-9 rounded-xl border border-border shadow-sm transition-transform duration-300 group-hover:scale-105 group-active:scale-95"
          />
          <span className="font-display hidden text-2xl font-black tracking-tight text-foreground lg:block">
            Tracr
          </span>
        </Link>

        {/* Primary nav */}
        <nav className="mt-4 flex flex-1 flex-col gap-1.5">
          {NAV.map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
        </nav>

        {/* Quick add */}
        <button
          onClick={() => setAddOpen(true)}
          className="pressable btn-sheen group mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-3 font-semibold text-primary-foreground transition-all duration-300 hover:brightness-[1.06]"
          aria-label="Log transaction"
        >
          <Plus className="h-5 w-5 stroke-[2.5] transition-transform duration-300 group-hover:rotate-90" />
          <span className="hidden text-sm lg:inline">Write it down</span>
        </button>
      </aside>

      {/* ───────────────────────── Main column ───────────────────────── */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Top utility header */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface/70 px-4 backdrop-blur-xl sm:px-6 lg:px-8 print:hidden">
          {/* Left: mobile brand · desktop breadcrumb */}
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.svg"
              alt="Tracr"
              className="h-8 w-8 rounded-lg border border-border shadow-sm sm:hidden"
            />
            <span className="section-head hidden text-lg text-foreground sm:block">{section}</span>
            <span className="section-head text-base sm:hidden">{section}</span>
          </div>

          {/* Right: sync · theme · profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" />
              Saved
            </span>

            <button
              onClick={() => setPaletteOpen(true)}
              className="pressable hidden h-9 items-center gap-2 rounded-xl border border-border bg-surface-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
              aria-label="Open command palette"
            >
              <Search className="h-4 w-4" />
              <span className="hidden lg:inline">Search</span>
              <kbd className="hidden rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-semibold lg:inline">
                Ctrl K
              </kbd>
            </button>

            <button
              onClick={() => setPaletteOpen(true)}
              className="pressable flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-muted/50 text-muted-foreground transition-colors hover:text-foreground md:hidden"
              aria-label="Open command palette"
            >
              <Search className="h-4 w-4" />
            </button>

            <NotificationBell />

            <button
              onClick={toggle}
              className="pressable flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-muted/50 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            <Link
              to="/settings"
              className="pressable transition-transform"
              aria-label="Profile & settings"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-9 w-9 rounded-xl border border-border object-cover shadow-sm transition-colors hover:border-primary/50"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-primary/10 text-sm font-bold text-primary transition-colors hover:border-primary/50">
                  {(profile?.display_name ?? 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </Link>
          </div>
        </header>

        {/* Scrolling body */}
        <main className="flex-1 px-4 pb-28 pt-6 sm:px-6 sm:pb-10 lg:px-8">
          <div key={pathname} className="mx-auto w-full max-w-[1500px] animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ───────────────────────── Mobile floating tab bar ───────────────────────── */}
      <nav className="glass-nav fixed bottom-5 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-border/80 p-1.5 shadow-lg sm:hidden print:hidden">
        <div className="grid grid-cols-5 items-center justify-items-center">
          <MobileNavLink to="/" label="Home" icon={LayoutDashboard} />
          <MobileNavLink to="/accounts" label="Accounts" icon={Wallet} />

          <div className="relative -mt-7">
            <button
              onClick={() => setAddOpen(true)}
              className="flex h-13 w-13 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-all duration-300 hover:scale-105 hover:brightness-[1.06] active:scale-95"
              aria-label="Add transaction"
            >
              <Plus className="h-6 w-6 stroke-[2.5]" />
            </button>
          </div>

          <MobileNavLink to="/transactions" label="Activity" icon={ArrowLeftRight} />
          <MobileNavLink to="/settings" label="Settings" icon={Settings} />
        </div>
      </nav>

      <TransactionForm open={addOpen} onClose={() => setAddOpen(false)} />
      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} commands={commands} />
      )}
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

function SidebarLink({ to, label, icon: Icon }: { to: string; label: string; icon: IconType }) {
  return (
    <NavLink to={to} end={to === '/'}>
      {({ isActive }) => (
        <span
          className={cn(
            'nav-rail group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200',
            'justify-center lg:justify-start',
            isActive
              ? 'bg-primary/10 text-primary shadow-sm'
              : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
          )}
          data-active={isActive}
        >
          <Icon className="h-5 w-5 shrink-0 transition-transform duration-300 group-hover:scale-110" />
          <span className="hidden lg:inline">{label}</span>
        </span>
      )}
    </NavLink>
  )
}

function MobileNavLink({ to, label, icon: Icon }: { to: string; label: string; icon: IconType }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'flex w-full flex-col items-center gap-1.5 rounded-xl py-2 text-xs font-semibold tracking-wide transition-all duration-300',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      <Icon className="h-5 w-5 transition-transform duration-300 active:scale-90" />
      <span className="text-xs">{label}</span>
    </NavLink>
  )
}
