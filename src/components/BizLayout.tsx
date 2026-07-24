import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Outlet, useLocation } from 'react-router-dom'
import { Store } from 'lucide-react'
import type { MsgKey } from '@/i18n'
import { useT } from '@/features/settings/language-context'
import { useActiveBook } from '@/features/books/useActiveBook'
import { BizTabs } from '@/components/BizTabs'
import { BackLink } from '@/components/ui/BackLink'

type BizRoute = { title: MsgKey; subtitle: MsgKey; bizOnly: MsgKey }

const ROUTES: Record<string, BizRoute> = {
  '/products': { title: 'nav.products', subtitle: 'prod.subtitle', bizOnly: 'prod.bizOnly' },
  '/debts': { title: 'debt.title', subtitle: 'debt.subtitle', bizOnly: 'debt.bizOnly' },
  '/profit': { title: 'nav.profit', subtitle: 'profit.subtitle', bizOnly: 'profit.bizOnly' },
}

// The header's right-hand action belongs to the page (it opens that page's
// form), but it is drawn in the shared header. The page portals it into this
// slot instead of the layout syncing state, so the header itself never
// re-renders on the page's account.
const HeaderSlot = createContext<HTMLElement | null>(null)

/** Renders `children` into the shared Buku Usaha header, top right. */
export function BizHeaderAction({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlot)
  return slot ? createPortal(children, slot) : null
}

/** Chrome shared by Produk, Kasbon and Laba-Rugi: back link, header, tab bar.
 *  It lives on a parent route so switching tabs swaps only the body — the
 *  header stays mounted and the tab indicator can slide instead of the whole
 *  page blinking through a re-mount. */
export function BizLayout() {
  const { t } = useT()
  const { pathname } = useLocation()
  const { activeBook } = useActiveBook()
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)

  const key = Object.keys(ROUTES).find((p) => pathname.startsWith(p))
  const route = key ? ROUTES[key] : undefined

  // Warm the sibling chunks so a tab switch never waits on a lazy import and
  // flashes the route spinner.
  useEffect(() => {
    void import('@/app/ProductsPage')
    void import('@/app/DebtsPage')
    void import('@/app/ProfitPage')
  }, [])

  // Guard: these tools only make sense inside a business book.
  if (activeBook && activeBook.type !== 'business') {
    return (
      <div className="mx-auto max-w-xl px-4 pt-8">
        <div className="flex flex-col items-center gap-4 rounded-[24px] border border-border bg-surface p-8 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Store className="h-7 w-7" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">{t('biz.onlyTitle')}</h2>
            {route && <p className="mt-1.5 text-sm text-muted-foreground">{t(route.bizOnly)}</p>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6 sm:pt-8">
      <BackLink to="/" label={t('nav.home')} className="mb-4" />

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-primary">
            {t('biz.ledger')}
            {activeBook && <span className="text-muted-foreground/70">· {activeBook.name}</span>}
          </span>
          {route && (
            <>
              <h1 className="mt-1 text-[27px] font-extrabold tracking-tight">{t(route.title)}</h1>
              {/* Two lines are reserved whatever the copy: a one-line subtitle
                  would otherwise pull the tab bar up as you switch tabs. */}
              <p className="mt-0.5 line-clamp-2 min-h-10 text-sm font-medium text-muted-foreground">
                {t(route.subtitle)}
              </p>
            </>
          )}
        </div>
        <div ref={setSlot} className="shrink-0" />
      </header>

      <BizTabs className="mt-4" />

      {/* Only the body is keyed, so the fade replays for the page content
          while the header and tabs above stay put. */}
      <HeaderSlot.Provider value={slot}>
        <div key={pathname} className="animate-fade-in">
          <Outlet />
        </div>
      </HeaderSlot.Provider>
    </div>
  )
}
