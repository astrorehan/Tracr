import { Link } from 'react-router-dom'
import { ChevronRight, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useT } from '@/features/settings/language-context'
import { noteText } from '@/features/notifications/notifications'
import { useNotifications } from '@/features/notifications/useNotifications'
import { cn } from '@/lib/utils'

/** Beyond this the card stops being a summary and starts being a list. */
const VISIBLE = 3

/**
 * The one place that answers "is anything on fire?".
 *
 * Read-state is deliberately ignored: these are live situations, not messages,
 * so an overdue bill stays here until it's actually paid. When there's nothing
 * wrong the card says so rather than disappearing — "all clear" is information
 * the user wants, and a home screen that only speaks up to complain trains
 * people to dread opening it.
 */
export function AttentionCard() {
  const { t } = useT()
  const { notifications } = useNotifications()
  const shown = notifications.slice(0, VISIBLE)

  if (shown.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-positive/12 text-positive">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">{t('attention.clearTitle')}</p>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">{t('attention.clearBody')}</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 px-1 text-base font-bold text-foreground">
        <TriangleAlert className="h-[18px] w-[18px] text-warning" />
        {t('attention.title')}
      </h2>

      <div className="mt-1.5 divide-y divide-border">
        {shown.map((n) => (
          <Link
            key={n.id}
            to={n.href}
            className="flex items-center gap-3 py-2.5 transition-opacity hover:opacity-80"
          >
            <span
              aria-hidden
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                n.severity === 'danger' ? 'bg-danger' : 'bg-warning',
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">{noteText(n.title, t)}</p>
              <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
                {noteText(n.body, t)}
              </p>
            </div>
            <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {notifications.length > VISIBLE && (
        <p className="px-1 pt-2 text-xs font-medium text-muted-foreground">
          {t('attention.andMore', { n: notifications.length - VISIBLE })}
        </p>
      )}
    </Card>
  )
}
