import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellOff, BellRing, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/features/settings/language-context'
import { HeaderPopover } from '@/components/ui/HeaderPopover'
import { noteText } from './notifications'
import { useNotifications, type ResolvedNotification } from './useNotifications'
import { usePushReminders } from './push'

/**
 * Header bell. The list opens in a portalled sheet (`HeaderPopover`) rather
 * than an absolute dropdown — as a child of the home hero, which is
 * `overflow-hidden`, the old panel was clipped to nothing on a phone and the
 * bell appeared to do nothing.
 */
export function NotificationBell({ onDark = false }: { onDark?: boolean }) {
  const { t } = useT()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'pressable relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
          onDark
            ? 'bg-white/18 text-white ring-1 ring-white/30 hover:bg-white/28'
            : 'bg-surface-muted text-muted-foreground ring-1 ring-border hover:text-foreground',
        )}
        aria-label={unreadCount > 0 ? t('notif.ariaUnread', { n: unreadCount }) : t('notif.title')}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-extrabold leading-none text-white',
              onDark ? 'ring-2 ring-white/40' : 'ring-2 ring-background',
            )}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <HeaderPopover
        open={open}
        onClose={() => setOpen(false)}
        title={t('notif.title')}
        closeLabel={t('layout.close')}
        action={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <Check className="h-3.5 w-3.5" /> {t('notif.markAllRead')}
            </button>
          ) : null
        }
      >
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-muted text-muted-foreground">
              <BellOff className="h-6 w-6" />
            </span>
            <p className="text-sm font-bold text-foreground">{t('notif.emptyTitle')}</p>
            <p className="text-xs font-medium text-muted-foreground">{t('notif.emptyBody')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
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
      </HeaderPopover>
    </>
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
