import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Coins, Moon, Settings, Settings2, Store, Sun, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/features/settings/language-context'
import { useAuth } from '@/features/auth/useAuth'
import { useTheme } from '@/features/settings/theme-context'
import { useActiveBook } from '@/features/books/useActiveBook'
import { useCreditBalance, totalRemaining } from '@/features/billing/api'
import { HeaderPopover } from '@/components/ui/HeaderPopover'

/**
 * The avatar in the header, and everything that used to be scattered around it.
 *
 * Settings left the mobile dock so the assistant could have that slot, so this
 * is now the way into it on a phone — along with the things that were eating
 * header width for no reason: the credit chip and the theme toggle. Switching
 * books also lives here, which is the first time that has been reachable
 * outside the home screen on mobile.
 */
export function UserMenu({ onDark = false }: { onDark?: boolean }) {
  const { t } = useT()
  const { profile, user } = useAuth()
  const { theme, setTheme } = useTheme()
  const { books, activeBookId, setActiveBook } = useActiveBook()
  const { data: credits, isLoading: creditsLoading } = useCreditBalance()
  const [open, setOpen] = useState(false)

  const name = profile?.display_name?.trim() || t('layout.you')
  const contact = user?.email ?? user?.phone ?? ''
  const remaining = totalRemaining(credits)
  const visibleBooks = books.filter((b) => !b.is_archived)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('layout.yourAccount')}
        className={cn(
          'pressable flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl transition-colors',
          onDark
            ? 'bg-white/18 text-white ring-1 ring-white/30 hover:bg-white/28'
            : 'bg-primary-soft text-primary ring-1 ring-border hover:brightness-95',
        )}
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-extrabold">{name.charAt(0).toUpperCase()}</span>
        )}
      </button>

      <HeaderPopover
        open={open}
        onClose={() => setOpen(false)}
        title={t('layout.yourAccount')}
        closeLabel={t('layout.close')}
      >
        {/* Who you are */}
        <Link
          to="/settings"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 border-b border-border px-4 py-3.5 transition-colors hover:bg-surface-muted"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary-soft text-primary">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-base font-extrabold">{name.charAt(0).toUpperCase()}</span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-extrabold text-foreground">{name}</span>
            {contact && (
              <span className="block truncate text-xs font-medium text-muted-foreground">
                {contact}
              </span>
            )}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>

        {/* AI credits */}
        <Link
          to="/billing"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-surface-muted"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-chip-violet-bg text-chip-violet-fg">
            <Coins className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-foreground">{t('layout.aiCredits')}</span>
            <span className="block text-xs font-medium text-muted-foreground">
              {t('layout.aiCreditsLeft', { n: creditsLoading ? '…' : remaining })}
            </span>
          </span>
          <span className="shrink-0 rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-extrabold text-primary">
            {t('layout.topUp')}
          </span>
        </Link>

        {/* Which book you're looking at */}
        <div className="border-b border-border px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              {t('layout.openBook')}
            </p>
            <Link
              to="/books"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-primary"
            >
              <Settings2 className="h-3 w-3" /> {t('layout.manageBooks')}
            </Link>
          </div>
          <div className="-mx-1 max-h-44 overflow-y-auto">
            {visibleBooks.map((book) => {
              const active = book.id === activeBookId
              const accent = book.color ?? 'var(--primary)'
              return (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => {
                    setActiveBook(book.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-surface-muted',
                    active ? 'font-bold text-foreground' : 'font-semibold text-muted-foreground',
                  )}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${accent}1f`, color: accent }}
                  >
                    {book.type === 'business' ? (
                      <Store className="h-4 w-4" />
                    ) : (
                      <Wallet className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{book.name}</span>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Light / dark — a labelled pair, not a mystery icon that flips */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm font-bold text-foreground">{t('settings.appearance')}</p>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface-muted p-1">
            {(
              [
                { value: 'light', label: t('settings.light'), icon: Sun },
                { value: 'dark', label: t('settings.dark'), icon: Moon },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                aria-pressed={theme === opt.value}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors',
                  theme === opt.value
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <opt.icon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <Link
          to="/settings"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-muted"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-muted-foreground">
            <Settings className="h-[18px] w-[18px]" />
          </span>
          <span className="flex-1 text-sm font-bold text-foreground">{t('layout.allSettings')}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      </HeaderPopover>
    </>
  )
}
