import type { ComponentType } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { HandCoins, Package, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MsgKey } from '@/i18n'
import { useT } from '@/features/settings/language-context'

type IconType = ComponentType<{ className?: string }>

// The three Buku Usaha tools, in the order a warung owner touches them:
// stock the catalog, note the kasbon, then read the result.
const TABS: { to: string; label: MsgKey; icon: IconType }[] = [
  { to: '/products', label: 'nav.products', icon: Package },
  { to: '/debts', label: 'debt.title', icon: HandCoins },
  { to: '/profit', label: 'nav.profit', icon: TrendingUp },
]

/** Quick switcher between the business tools. The mobile dock has no slot for
 *  them, so without this the only way in is a trip back to the dashboard.
 *  BizLayout keeps this mounted across all three routes, so the indicator
 *  transitions from wherever it already is. */
export function BizTabs({ className }: { className?: string }) {
  const { t } = useT()
  const { pathname } = useLocation()
  const slot = TABS.findIndex((tab) => pathname.startsWith(tab.to))

  return (
    <nav
      aria-label={t('biz.tools')}
      className={cn(
        'relative grid grid-cols-3 gap-1 rounded-[18px] border border-border bg-surface-muted p-1',
        className,
      )}
    >
      {/* Sliding chip behind the active tab. Decelerating ease, no overshoot. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem-0.5rem)/3)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)]"
        style={{
          transform: `translateX(calc(${slot < 0 ? 0 : slot} * (100% + 0.25rem)))`,
          opacity: slot < 0 ? 0 : 1,
        }}
      >
        <span className="block h-full w-full rounded-[14px] bg-surface shadow-sm" />
      </span>

      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className="relative">
          {({ isActive }) => (
            <span
              className={cn(
                'pressable flex h-10 items-center justify-center gap-1.5 text-[13px] font-extrabold transition-colors duration-300',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t(label)}</span>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
