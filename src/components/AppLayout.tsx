import { useState, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MsgKey } from '@/i18n'
import { useT } from '@/features/settings/language-context'
import { useAuth } from '@/features/auth/useAuth'
import { useActiveBook } from '@/features/books/useActiveBook'
import { BookSwitcher } from '@/features/books/BookSwitcher'
import { CenterSpinner } from '@/components/ui/States'
import { useTheme } from '@/features/settings/theme-context'
import { useLiveRatesSync } from '@/features/fx/useLiveRatesSync'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import { NotificationBell } from '@/features/notifications/NotificationBell'

type IconType = ComponentType<{ className?: string }>

const NAV: { to: string; label: MsgKey; icon: IconType }[] = [
  { to: '/', label: 'nav.home', icon: LayoutDashboard },
  { to: '/accounts', label: 'nav.accounts', icon: Wallet },
  { to: '/transactions', label: 'nav.activity', icon: ArrowLeftRight },
  { to: '/reports', label: 'nav.reports', icon: BarChart3 },
  { to: '/budgets', label: 'nav.budgets', icon: Target },
  { to: '/bills', label: 'nav.bills', icon: Receipt },
  { to: '/goals', label: 'nav.goals', icon: PiggyBank },
  { to: '/settings', label: 'nav.settings', icon: Settings },
]

export function AppLayout() {
  const [addOpen, setAddOpen] = useState(false)
  const { profile } = useAuth()
  const { activeBookId, loading: booksLoading } = useActiveBook()
  const { theme, toggle } = useTheme()
  const { t } = useT()
  const { pathname } = useLocation()
  const isHome = pathname === '/'

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
          aria-label={t('layout.recordTransaction')}
        >
          <Plus className="h-5 w-5 stroke-[2.5] transition-transform duration-300 group-hover:rotate-90" />
          <span className="hidden text-sm lg:inline">{t('layout.writeItDown')}</span>
        </button>
      </aside>

      {/* ───────────────────────── Main column ───────────────────────── */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Floating top right controls */}
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 sm:gap-3 sm:right-6 lg:right-8 print:hidden">
          <div className="bg-surface/80 backdrop-blur rounded-xl border border-border flex items-center p-1 shadow-sm gap-1">
            <NotificationBell />
            <button
              onClick={toggle}
              className="pressable flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
              aria-label={t('layout.toggleTheme')}
            >
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <Link
              to="/settings"
              className="pressable transition-transform"
              aria-label={t('layout.profileSettings')}
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-9 w-9 rounded-lg object-cover transition-opacity hover:opacity-80"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-sm font-bold text-primary transition-opacity hover:opacity-80">
                  {(profile?.display_name ?? 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </Link>
          </div>
        </div>

        {/* Scrolling body. The home route drops padding so its gradient hero can
            bleed edge-to-edge; the page manages its own spacing there. */}
        <main
          className={cn(
            'flex-1 pb-28 sm:pb-10',
            !isHome && 'px-4 pt-6 sm:px-6 lg:px-8',
          )}
        >
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
          <MobileNavLink to="/" label="nav.home" icon={LayoutDashboard} />
          <MobileNavLink to="/accounts" label="nav.accounts" icon={Wallet} />

          {/* Spacer column — the Record button is absolutely centered on the bar's
              top edge below, so it straddles the border (half out, half in). */}
          <div aria-hidden />

          <MobileNavLink to="/transactions" label="nav.activity" icon={ArrowLeftRight} />
          <MobileNavLink to="/settings" label="nav.settings" icon={Settings} />
        </div>

        <button
          onClick={() => setAddOpen(true)}
          className="brand-gradient pressable absolute left-1/2 top-0 flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-[18px] items-center justify-center rounded-[22px] text-white shadow-lg shadow-primary/40 transition-transform hover:scale-105 active:scale-95"
          aria-label={t('layout.recordTransaction')}
        >
          <Plus className="h-8 w-8 stroke-[2.5]" />
        </button>
      </nav>

      <TransactionForm open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

function SidebarLink({ to, label, icon: Icon }: { to: string; label: MsgKey; icon: IconType }) {
  const { t } = useT()
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
          <span className="hidden lg:inline">{t(label)}</span>
        </span>
      )}
    </NavLink>
  )
}

function MobileNavLink({ to, label, icon: Icon }: { to: string; label: MsgKey; icon: IconType }) {
  const { t } = useT()
  return (
    <NavLink to={to} end={to === '/'} className="flex w-full flex-col items-center gap-1 py-2">
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'flex items-center justify-center rounded-full px-5 py-1 transition-colors duration-200',
              isActive ? 'bg-primary-soft text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="h-[22px] w-[22px] transition-transform duration-200 active:scale-90" />
          </span>
          <span
            className={cn(
              'text-[11px] font-semibold transition-colors duration-200',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {t(label)}
          </span>
        </>
      )}
    </NavLink>
  )
}
