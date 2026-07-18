import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellOff, BellRing, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/features/settings/language-context'
import { noteText } from './notifications'
import { useNotifications, type ResolvedNotification } from './useNotifications'
import { usePushReminders } from './push'

export function NotificationBell({ variant = 'default' }: { variant?: 'default' | 'onDark' }) {
  const { t } = useT()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'pressable relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
          variant === 'onDark'
            ? 'bg-white/15 text-white hover:bg-white/25'
            : cn(
                'border border-border bg-surface-muted/50 text-muted-foreground hover:text-foreground',
                open && 'text-foreground',
              ),
        )}
        aria-label={unreadCount > 0 ? t('notif.ariaUnread', { n: unreadCount }) : t('notif.title')}
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-[20rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-border bg-surface shadow-lg animate-slide-up">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="section-head text-sm text-foreground">{t('notif.title')}</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Check className="h-3 w-3" /> {t('notif.markAllRead')}
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <BellOff className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">{t('notif.emptyTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('notif.emptyBody')}</p>
              </div>
            ) : (
              <div className="max-h-[min(70vh,26rem)] divide-y divide-border overflow-y-auto">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    note={n}
                    onClick={() => {
                      markRead(n.id)
                      setOpen(false)
                    }}
                  />
                ))}
              </div>
            )}

            <PushFooter />
          </div>
        </>
      )}
    </div>
  )
}

/** Per-device toggle for Web Push reminders (overdue bills, budget alerts). */
function PushFooter() {
  const { t } = useT()
  const { supported, enabled, busy, error, blocked, enable, disable } = usePushReminders()
  if (!supported) return null

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <BellRing className="h-3.5 w-3.5 text-muted-foreground" />
          {t('notif.push.title')}
        </div>
        <button
          onClick={() => (enabled ? disable() : enable())}
          disabled={busy || blocked}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
            enabled
              ? 'text-muted-foreground hover:bg-surface-muted hover:text-foreground'
              : 'bg-primary/10 text-primary hover:bg-primary/15',
          )}
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          {t(enabled ? 'notif.push.turnOff' : 'notif.push.turnOn')}
        </button>
      </div>
      {blocked ? (
        <p className="mt-1.5 text-xs font-medium text-muted-foreground">{t('notif.push.blocked')}</p>
      ) : error ? (
        <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs font-medium text-muted-foreground">{t('notif.push.body')}</p>
      )}
    </div>
  )
}

function NotificationItem({ note, onClick }: { note: ResolvedNotification; onClick: () => void }) {
  const { t } = useT()
  return (
    <Link
      to={note.href}
      onClick={onClick}
      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
    >
      <span
        aria-hidden
        className={cn(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          note.severity === 'danger' ? 'bg-danger' : 'bg-warning',
          note.read && 'opacity-30',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm leading-snug text-foreground', note.read ? 'font-medium' : 'font-bold')}>
          {noteText(note.title, t)}
        </p>
        <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
          {noteText(note.body, t)}
        </p>
      </div>
    </Link>
  )
}
