import { useLocation } from 'react-router-dom'
import { BackLink } from '@/components/ui/BackLink'
import { useT } from '@/features/settings/language-context'
import type { MsgKey } from '@/i18n'

/** Config pages listed on Settings — they go back there, not to Home. */
const SETTINGS_CHILDREN = [
  '/categories',
  '/tags',
  '/rules',
  '/currencies',
  '/data',
  '/books',
  '/telegram',
  '/billing',
]

/**
 * Where "back" leads from a route. Hierarchical on purpose (a parent, never
 * `history.back()`): the same page always sends you to the same place, whether
 * you got there from a tile, a tab or a deep link.
 */
function backTargetFor(pathname: string): { to: string; label: MsgKey } | null {
  if (pathname === '/') return null // the root — nothing above it
  if (pathname.startsWith('/accounts/')) return { to: '/accounts', label: 'nav.accounts' }
  if (SETTINGS_CHILDREN.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
    return { to: '/settings', label: 'nav.settings' }
  return { to: '/', label: 'nav.home' }
}

/** The one back control every page inside the app shell gets, top-left. */
export function PageBack({ className }: { className?: string }) {
  const { pathname } = useLocation()
  const { t } = useT()
  const target = backTargetFor(pathname)
  if (!target) return null
  const label = t(target.label)
  return (
    <BackLink
      to={target.to}
      label={label}
      aria-label={t('nav.backTo', { page: label })}
      className={className}
    />
  )
}
