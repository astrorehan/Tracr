import { Fragment, useMemo, useState, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  BarChart3,
  ClipboardList,
  HandCoins,
  Package,
  TrendingUp,
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
import { CreditChip } from '@/features/billing/CreditChip'

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
  ],
  [{ to: '/settings', label: 'nav.settings', icon: Settings }],
]

// Mobile dock slots, left to right. `null` is the center slot the raised
// Record button sits over.
const MOBILE_NAV: ({ to: string; label: MsgKey; icon: IconType } | null)[] = [
  { to: '/', label: 'nav.home', icon: LayoutDashboard },
  { to: '/accounts', label: 'nav.accounts', icon: Wallet },
  null,
  { to: '/transactions', label: 'nav.activity', icon: ArrowLeftRight },
  { to: '/settings', label: 'nav.settings', icon: Settings },
]

function mobileSlotFor(pathname: string) {
  return MOBILE_NAV.findIndex(
    (item) =>
      item !== null &&
      (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)),
  )
}

export function AppLayout() {
  const [addOpen, setAddOpen] = useState(false)
  const { profile } = useAuth()
  const { activeBookId, activeBook, loading: booksLoading } = useActiveBook()
  const { theme, toggle } = useTheme()
  const { t } = useT()
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const activeSlot = mobileSlotFor(pathname)

  // Business books get the POS-lite (products) + laba-rugi (profit) +
  // Utang-Piutang (debts) tools inserted into the last group, just above
  // Settings.
  const navGroups = useMemo(() => {
    if (activeBook?.type !== 'business') return NAV_GROUPS
    const groups = NAV_GROUPS.map((g) => [...g])
    const last = groups[groups.length - 1]
    const at = last.findIndex((i) => i.to === '/settings')
    last.splice(
      at,
      0,
      { to: '/products', label: 'nav.products', icon: Package },
      { to: '/profit', label: 'nav.profit', icon: TrendingUp },
      { to: '/debts', label: 'nav.debts', icon: HandCoins },
    )
    return groups
  }, [activeBook?.type])

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
        {/* Floating top right controls — desktop only. On mobile the home hero
            carries its own copy of these, and on other routes the bottom dock
            covers navigation, so the floating pill was just overlapping content. */}
        <div className="fixed top-4 right-4 z-50 hidden items-center gap-2 sm:flex sm:gap-3 sm:right-6 lg:right-8 print:hidden">
          <div className="bg-surface/80 backdrop-blur rounded-xl border border-border flex items-center p-1 shadow-sm gap-1">
            <CreditChip />
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
          Floating pill dock: 5 slots, icons only, a gradient indicator that
          slides between them, and the raised gradient Record button in the
          middle slot. */}
      {/* Geometry is px, never rem: the text-size setting scales the root font
          size, which would otherwise inflate the whole bar on the larger steps. */}
      <nav
        className="dock-shadow fixed inset-x-[16px] z-40 rounded-[24px] border border-border bg-surface sm:hidden print:hidden"
        style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      >
        {/* No horizontal padding on the grid: each column is exactly a fifth of
            the bar, which is what the indicator's `w-1/5` + translate assumes. */}
        <div className="relative grid grid-cols-5 py-[5px]">
          {/* Sliding active indicator. Parked under the center slot and faded
              out when no tab matches, so it never animates in from a corner.
              Decelerating ease only — no overshoot past the target slot. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-[5px] left-0 w-1/5 px-[12px] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)]"
            style={{
              transform: `translateX(${(activeSlot < 0 ? 2 : activeSlot) * 100}%)`,
              opacity: activeSlot < 0 ? 0 : 1,
            }}
          >
            <span className="brand-gradient block h-full w-full rounded-[14px] shadow-sm shadow-primary/40" />
          </span>

          {MOBILE_NAV.map((item, i) =>
            item ? (
              <MobileNavLink key={item.to} {...item} />
            ) : (
              // Spacer column — the Record button is absolutely centered over it.
              <div key={`slot-${i}`} aria-hidden className="h-[40px]" />
            ),
          )}
        </div>

        <button
          onClick={() => setAddOpen(true)}
          className="fab-record pressable group absolute left-1/2 top-0 flex h-[60px] w-[60px] -translate-x-1/2 -translate-y-[17px] items-center justify-center rounded-[19px] text-white ring-[3px] ring-surface transition-transform duration-300 hover:scale-105 active:scale-95"
          aria-label={t('layout.recordTransaction')}
        >
          <Plus className="h-[28px] w-[28px] stroke-[2.75] transition-transform duration-300 group-active:rotate-90" />
        </button>
      </nav>

      <TransactionForm open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

function SidebarLink({ to, label, icon: Icon, match }: NavItem) {
  const { t } = useT()
  const { pathname } = useLocation()
  // A link with `match` owns several routes, so decide active ourselves; plain
  // links fall back to NavLink's own path matching.
  const matched = match
    ? match.some((p) => (p === '/' ? pathname === '/' : pathname.startsWith(p)))
    : undefined
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

// Icon-only dock tab. `relative` keeps it painting above the absolutely
// positioned indicator that slides in behind it.
function MobileNavLink({ to, label, icon: Icon }: { to: string; label: MsgKey; icon: IconType }) {
  const { t } = useT()
  return (
    <NavLink
      to={to}
      end={to === '/'}
      aria-label={t(label)}
      className="relative flex h-[40px] w-full items-center justify-center"
    >
      {({ isActive }) => (
        <Icon
          className={cn(
            'h-[21px] w-[21px] transition-[color,transform] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] active:scale-90',
            isActive ? 'scale-105 text-white' : 'text-muted-foreground',
          )}
        />
      )}
    </NavLink>
  )
}
