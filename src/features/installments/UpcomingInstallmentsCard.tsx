import { Link } from 'react-router-dom'
import { CalendarClock, CreditCard, Share2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { IconChip, ListRow } from '@/components/ui/list'
import { formatMoney } from '@/lib/money'
import { useT } from '@/features/settings/language-context'
import { useInstallments } from './api'
import { getDaysUntilDue } from './progress'
import { cn } from '@/lib/utils'

export function UpcomingInstallmentsCard() {
  const { t } = useT()
  const { data: installments = [], isLoading } = useInstallments()

  const activeInstallments = installments.filter(
    (inst) => inst.status === 'active' && inst.paid_months < inst.tenor_months,
  )

  const upcomingList = activeInstallments
    .map((inst) => {
      const days = getDaysUntilDue(inst.due_day)
      return { inst, days, overdue: days < 0 }
    })
    .sort((a, b) => a.days - b.days)

  if (isLoading || upcomingList.length === 0) {
    return null
  }

  const totalMonthlyBurden = activeInstallments.reduce((sum, i) => sum + i.monthly_amount, 0)
  const overdueCount = upcomingList.filter((item) => item.overdue).length

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-base font-bold text-foreground">
          {t('installments.title')}
        </h2>
        <Link
          to="/installments"
          className="text-sm font-semibold text-primary transition hover:underline"
        >
          {t('dash.seeAll')}
        </Link>
      </div>

      <div className="mt-1 flex items-baseline gap-2 px-1">
        <p className="font-numeric text-xl font-extrabold tracking-tight text-foreground">
          {formatMoney(totalMonthlyBurden, 'IDR')}
        </p>
        <span className="text-xs text-muted-foreground">/{t('planning.freq.monthly')}</span>
        {overdueCount > 0 && (
          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">
            {t('bills.overdueCount', { n: overdueCount })}
          </span>
        )}
      </div>

      <div className="mt-2 divide-y divide-border">
        {upcomingList.slice(0, 4).map(({ inst, days, overdue }) => {
          const dueLabel = overdue
            ? t('installments.overdue', { days: Math.abs(days), date: '' }).split(' (')[0]
            : days === 0
              ? t('installments.dueToday', { date: '' }).split(' (')[0]
              : t('installments.dueIn', { days, date: '' }).split(' (')[0]

          const handleShareWA = (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            const text = encodeURIComponent(
              `📌 *Pengingat Cicilan Tracr*\n` +
                `Nama: *${inst.name}*\n` +
                `Tagihan Bulan Ini: *${formatMoney(inst.monthly_amount, 'IDR')}*\n` +
                `Jatuh Tempo: *Tgl ${inst.due_day}*\n` +
                `Status: *${dueLabel}*`,
            )
            window.open(`https://wa.me/?text=${text}`, '_blank')
          }

          return (
            <ListRow
              key={inst.id}
              to="/installments"
              chevron={false}
              leading={
                <IconChip
                  icon={overdue ? CalendarClock : CreditCard}
                  color={overdue ? 'red' : 'blue'}
                />
              }
              title={inst.name}
              subtitle={
                <span className={cn('text-xs font-semibold', overdue ? 'text-danger' : 'text-muted-foreground')}>
                  {dueLabel} · {inst.paid_months}/{inst.tenor_months} bln
                </span>
              }
              trailing={
                <div className="flex items-center gap-2">
                  <p className="font-numeric text-sm font-extrabold tracking-tight text-foreground">
                    {formatMoney(inst.monthly_amount, 'IDR')}
                  </p>
                  <button
                    type="button"
                    onClick={handleShareWA}
                    title="Kirim Reminder WA"
                    className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              }
            />
          )
        })}
      </div>
    </Card>
  )
}
