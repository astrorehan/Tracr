import { useState, type ComponentType } from 'react'
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
  ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/useAuth'
import { useActiveBook } from '@/features/books/useActiveBook'
import { BookSwitcher } from '@/features/books/BookSwitcher'
import { CenterSpinner } from '@/components/ui/States'
import { useTheme } from '@/features/settings/theme-context'
import { useLiveRatesSync } from '@/features/fx/useLiveRatesSync'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import { NotificationBell } from '@/features/notifications/NotificationBell'

type IconType = ComponentType<{ className?: string }>

const NAV: { to: string; label: string; icon: IconType }[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/transactions', label: 'Activity', icon: ArrowLeftRight },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/budgets', label: 'Budgets', icon: Target },
  { to: '/bills', label: 'Bills', icon: Receipt },
  { to: '/goals', label: 'Goals', icon: PiggyBank },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const SECTION_TITLES: Record<string, string> = {
  '/': 'Home',
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
  '/books': 'Books',
}

export function AppLayout() {
  const [addOpen, setAddOpen] = useState(false)
  const { profile } = useAuth()
  const { activeBookId, loading: booksLoading } = useActiveBook()
  const { theme, toggle } = useTheme()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isHome = pathname === '/'
  const section = SECTION_TITLES[pathname] ?? 'Workspace'
  const firstName = profile?.display_name?.split(' ')[0]

  // Refresh FX rates from the free live sources once per session.
  useLiveRatesSync()

  // Hold the app until we know which book is active, so no child query fires
  // with a missing book_id and flashes empty data.
  if (booksLoading || !activeBookId) return <CenterSpinner />

  return (
    <div className="app-atmosphere relative flex min-h-screen w-full bg-background text-foreground">
      {/* ───────────────────────── Desktop / tablet sidebar ───────────────────────── */}
      <aside className="sticky top-0 z-30 hidden h-screen w-[84px] shrink-0 flex-col border-r border-border bg-surface px-4 py-5 sm:flex lg:w-[260px] print:hidden">
        {/* Brand */}
        <Link to="/" className="group mb-2 flex items-center gap-3 px-1.5 py-2">
          <img
            src="/logo.svg"
            alt="Tracr"
            className="h-9 w-9 rounded-xl border border-border shadow-sm transition-transform duration-300 group-hover:scale-105 group-active:scale-95"
          />
          <span className="font-display hidden text-2xl font-extrabold tracking-tight text-foreground lg:block">
            Tracr
          </span>
        </Link>

        {/* Book switcher */}
        <div className="mt-1">
          <BookSwitcher />
        </div>

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
          aria-label="Record a transaction"
        >
          <Plus className="h-5 w-5 stroke-[2.5] transition-transform duration-300 group-hover:rotate-90" />
          <span className="hidden text-sm lg:inline">Write it down</span>
        </button>
      </aside>

      {/* ───────────────────────── Main column ───────────────────────── */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Top header: greeting on home, back + title on subpages. Solid, no blur. */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4 sm:px-6 lg:px-8 print:hidden">
          {/* Left: greeting (home) · back + title (subpages) */}
          {isHome ? (
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.svg"
                alt="Tracr"
                className="h-8 w-8 rounded-lg border border-border shadow-sm sm:hidden"
              />
              <p className="text-base font-bold text-foreground sm:text-lg">
                {greeting()}
                {firstName ? `, ${firstName}` : ''} 👋
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigate(-1)}
                className="pressable -ml-1.5 flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                aria-label="Go back"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-base font-bold text-foreground sm:text-lg">{section}</span>
            </div>
          )}

          {/* Right: sync · notifications · theme · profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" />
              Saved
            </span>

            <NotificationBell />

            <button
              onClick={toggle}
              className="pressable flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-muted text-muted-foreground transition-colors hover:text-foreground"
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
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-primary-soft text-sm font-bold text-primary transition-colors hover:border-primary/50">
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

      {/* ───────────────────────── Mobile bottom tab bar ─────────────────────────
          Solid full-width bar (GoPay style): 5 slots, labels always on, active in
          brand color, raised gradient Record button. No backdrop-blur. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden print:hidden">
        <div className="grid grid-cols-5 items-end px-1 pt-1.5">
          <MobileNavLink to="/" label="Home" icon={LayoutDashboard} />
          <MobileNavLink to="/accounts" label="Accounts" icon={Wallet} />

          <div className="flex justify-center">
            <button
              onClick={() => setAddOpen(true)}
              className="brand-gradient pressable -mt-6 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-md transition-transform hover:scale-105"
              aria-label="Record a transaction"
            >
              <Plus className="h-6 w-6 stroke-[2.5]" />
            </button>
          </div>

          <MobileNavLink to="/transactions" label="Activity" icon={ArrowLeftRight} />
          <MobileNavLink to="/settings" label="Settings" icon={Settings} />
        </div>
      </nav>

      <TransactionForm open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

function SidebarLink({ to, label, icon: Icon }: { to: string; label: string; icon: IconType }) {
  return (
    <NavLink to={to} end={to === '/'}>
      {({ isActive }) => (
        <span
          className={cn(
            'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200',
            'justify-center lg:justify-start',
            isActive
              ? 'bg-primary-soft text-primary'
              : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
          )}
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
          'flex w-full flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition-colors duration-200',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      <Icon className="h-[22px] w-[22px] transition-transform duration-200 active:scale-90" />
      <span>{label}</span>
    </NavLink>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
