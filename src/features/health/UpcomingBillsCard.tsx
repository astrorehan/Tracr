import { Link } from 'react-router-dom'
import { CalendarCheck, Receipt } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { IconChip, ListRow } from '@/components/ui/list'
import { formatMoney } from '@/lib/money'
import { useT } from '@/features/settings/language-context'
import { cn } from '@/lib/utils'
import type { BillsAhead } from './health'

/** Bills shown before the card starts hiding the rest behind "see all". */
const VISIBLE = 4

/**
 * What's owed in the next fortnight, and what's left of the cash once it's
 * paid. This is the difference between "I have Rp 3m" and "I have Rp 3m but
 * Rp 2.1m of it is already spoken for" — the number people actually plan with.
 */
export function UpcomingBillsCard({
  bills,
  spendable,
  base,
}: {
  bills: BillsAhead
  /** Cash on hand — bills get paid from this, not from investments. */
  spendable: number
  base: string
}) {
  const { t } = useT()
  const money = (v: number) => formatMoney(v, base, { signDisplay: 'never' })
  const afterBills = spendable - bills.total

  if (bills.items.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <IconChip icon={CalendarCheck} color="green" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">{t('bills.clearTitle')}</p>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">{t('bills.clearBody')}</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-base font-bold text-foreground">{t('bills.title')}</h2>
        <Link to="/bills" className="text-sm font-semibold text-primary transition hover:underline">
          {t('dash.seeAll')}
        </Link>
      </div>

      <div className="mt-1 flex items-baseline gap-2 px-1">
        <p className="font-numeric text-xl font-extrabold tracking-tight text-foreground">
          {money(bills.total)}
        </p>
        {bills.overdueCount > 0 && (
          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">
            {t('bills.overdueCount', { n: bills.overdueCount })}
          </span>
        )}
      </div>
      <p className="px-1 text-xs font-medium text-muted-foreground">
        {t('bills.afterPaying', { amount: money(Math.max(0, afterBills)) })}
      </p>

      <div className="mt-2 divide-y divide-border">
        {bills.items.slice(0, VISIBLE).map(({ rec, days, overdue, base: value }) => (
          <ListRow
            key={rec.id}
            to="/bills"
            chevron={false}
            leading={<IconChip icon={Receipt} color={overdue ? 'red' : 'slate'} />}
            title={rec.name}
            subtitle={<DueLabel days={days} overdue={overdue} />}
            trailing={
              <p className="font-numeric text-sm font-extrabold tracking-tight text-foreground">
                {value != null ? money(value) : formatMoney(rec.amount, rec.currency, { signDisplay: 'never' })}
              </p>
            }
          />
        ))}
      </div>

      {bills.items.length > VISIBLE && (
        <p className="px-1 pt-2 text-xs font-medium text-muted-foreground">
          {t('bills.andMore', { n: bills.items.length - VISIBLE })}
        </p>
      )}
      {bills.partial && (
        <p className="px-1 pt-1 text-[11px] font-medium text-muted-foreground">{t('bills.partialTotal')}</p>
      )}
    </Card>
  )
}

/** Relative due phrasing, translated — `dueText` in the schedule module is English-only. */
function DueLabel({ days, overdue }: { days: number; overdue: boolean }) {
  const { t } = useT()
  const label = overdue
    ? t('bills.overdueBy', { n: Math.abs(days) })
    : days === 0
      ? t('bills.dueToday')
      : days === 1
        ? t('bills.dueTomorrow')
        : t('bills.dueInDays', { n: days })
  return <span className={cn(overdue && 'font-bold text-danger')}>{label}</span>
}
