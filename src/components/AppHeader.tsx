import { useLocation } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MsgKey } from '@/i18n'
import { useScrolled } from '@/lib/useScrolled'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useT } from '@/features/settings/language-context'
import { useAuth } from '@/features/auth/useAuth'
import { useAi } from '@/features/ai/ai-context'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { UserMenu } from '@/components/UserMenu'

/** Route → the name the header shows. Longest-matching prefix wins. */
const TITLES: { prefix: string; label: MsgKey }[] = [
  { prefix: '/accounts', label: 'nav.accounts' },
  { prefix: '/transactions', label: 'nav.activity' },
  { prefix: '/reports', label: 'nav.reports' },
  { prefix: '/budgets', label: 'nav.planning' },
  { prefix: '/bills', label: 'nav.planning' },
  { prefix: '/goals', label: 'nav.planning' },
  { prefix: '/installments', label: 'nav.installments' },
  { prefix: '/products', label: 'nav.products' },
  { prefix: '/debts', label: 'nav.debts' },
  { prefix: '/contacts', label: 'ct.title' },
  { prefix: '/profit', label: 'nav.profit' },
  { prefix: '/categories', label: 'section.categories' },
  { prefix: '/tags', label: 'section.tags' },
  { prefix: '/rules', label: 'rules.title' },
  { prefix: '/currencies', label: 'fx.title' },
  { prefix: '/data', label: 'data.title' },
  { prefix: '/books', label: 'books.title' },
  { prefix: '/telegram', label: 'tg.title' },
  { prefix: '/billing', label: 'billing.title' },
  { prefix: '/settings', label: 'nav.settings' },
]

function titleFor(pathname: string): MsgKey | null {
  return TITLES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`))?.label ?? null
}

/**
 * The one header for every route and every screen size.
 *
 * It replaces two things that used to disagree with each other: a floating
 * pill that only existed on desktop, and a copy of the same controls hidden
 * inside the home hero on mobile — which meant that on a phone, on any route
 * but Home, there was no bell, no credits and no way to the assistant at all.
 *
 * On the mobile home screen it rides transparently over the blue hero and
 * turns into a blurred sheet as soon as the page scrolls.
 */
export function AppHeader() {
  const { pathname } = useLocation()
  const { profile } = useAuth()
  const { t } = useT()
  const ai = useAi()
  const scrolled = useScrolled(20)
  // Below sm the home hero is a full-bleed gradient the bar sits on top of;
  // from sm up it is a rounded card further down the page and the bar is
  // always a normal light/dark bar. The breakpoint has to be readable in JS
  // because it decides props on the bell, the avatar and the assistant button
  // — not just classes on one element.
  const isPhone = useMediaQuery('(max-width: 639.98px)')

  const isHome = pathname === '/'
  const onDark = isHome && isPhone && !scrolled
  const titleKey = titleFor(pathname)
  const firstName = profile?.display_name?.trim().split(/\s+/)[0]

  return (
    <header
      className={cn(
        // The bar owns the notch inset: it is the element that reaches the top
        // of the screen once the page scrolls, so its background has to fill
        // the status bar strip instead of sliding under it.
        'sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] transition-colors duration-300 print:hidden',
        onDark
          ? 'border-transparent bg-transparent'
          : 'border-border bg-background/80 backdrop-blur-xl',
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-2 px-4 sm:h-16 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate text-[15px] font-extrabold tracking-tight transition-colors duration-300 sm:text-[17px]',
              onDark ? 'text-white' : 'text-foreground',
            )}
          >
            {isHome
              ? firstName
                ? t('layout.hi', { name: firstName })
                : t('nav.home')
              : titleKey
                ? t(titleKey)
                : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* The assistant, one tap from every route. */}
          <button
            type="button"
            onClick={() => ai.open()}
            title={t('layout.askAiHint')}
            aria-label={t('layout.askAi')}
            className={cn(
              'pressable btn-sheen group flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 font-bold transition-all duration-300 lg:pl-3 lg:pr-2',
              onDark
                ? 'bg-white text-primary shadow-sm hover:bg-white/90'
                : 'brand-gradient text-white shadow-sm shadow-primary/25 hover:brightness-[1.06]',
            )}
          >
            <Sparkles className="h-[18px] w-[18px] shrink-0 transition-transform duration-300 group-hover:rotate-12" />
            <span className="hidden text-[13px] lg:inline">{t('layout.askAi')}</span>
            <kbd
              aria-hidden
              className={cn(
                'ml-0.5 hidden h-5 min-w-5 items-center justify-center rounded-md px-1 font-mono text-[11px] font-bold lg:inline-flex',
                onDark ? 'bg-primary/10 text-primary' : 'bg-white/20 text-white',
              )}
            >
              /
            </kbd>
          </button>

          <NotificationBell onDark={onDark} />
          <UserMenu onDark={onDark} />
        </div>
      </div>
    </header>
  )
}
