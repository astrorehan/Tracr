import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { IconChip, ListRow } from '@/components/ui/list'
import { formatMoney } from '@/lib/money'
import { useT } from '@/features/settings/language-context'
import { useDebts } from './api'
import { useActiveBook } from '@/features/books/useActiveBook'
import { useAuth } from '@/features/auth/useAuth'

export function UpcomingDebtsCard() {
  const { t } = useT()
  const { profile } = useAuth()
  const { activeBook } = useActiveBook()
  const base = profile?.base_currency ?? 'IDR'
  const { data: debts = [], isLoading } = useDebts()

  const openDebts = debts.filter((d) => d.status === 'open')

  if (isLoading || openDebts.length === 0) {
    return null
  }

  const isPersonal = activeBook?.type === 'personal'
  const titleKey = isPersonal ? 'debt.titlePersonal' : 'debt.titleBusiness'

  const receivableTotal = openDebts
    .filter((d) => d.direction === 'receivable')
    .reduce((sum, d) => sum + Math.max(0, d.amount - d.paid), 0)

  const payableTotal = openDebts
    .filter((d) => d.direction === 'payable')
    .reduce((sum, d) => sum + Math.max(0, d.amount - d.paid), 0)

  const topDebts = openDebts.slice(0, 4)

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-base font-bold text-foreground">{t(titleKey)}</h2>
        <Link to="/debts" className="text-sm font-semibold text-primary transition hover:underline">
          {t('dash.seeAll')}
        </Link>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-surface-muted p-2 text-xs">
        <div>
          <span className="text-muted-foreground">{t('debt.filterRcv')}</span>
          <p className="font-numeric text-sm font-extrabold text-positive">
            {formatMoney(receivableTotal, base, { signDisplay: 'never' })}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">{t('debt.filterPay')}</span>
          <p className="font-numeric text-sm font-extrabold text-danger">
            {formatMoney(payableTotal, base, { signDisplay: 'never' })}
          </p>
        </div>
      </div>

      <div className="mt-2 divide-y divide-border">
        {topDebts.map((d) => {
          const remaining = Math.max(0, d.amount - d.paid)
          const isRcv = d.direction === 'receivable'
          const name = d.contact?.name ?? d.note ?? t('debt.noNote')

          return (
            <ListRow
              key={d.id}
              to="/debts"
              chevron={false}
              leading={
                <IconChip
                  icon={isRcv ? ArrowDownLeft : ArrowUpRight}
                  color={isRcv ? 'green' : 'red'}
                />
              }
              title={name}
              subtitle={isRcv ? t('debt.filterRcv') : t('debt.filterPay')}
              trailing={
                <p className={`font-numeric text-sm font-extrabold ${isRcv ? 'text-positive' : 'text-danger'}`}>
                  {formatMoney(remaining, d.currency ?? base, { signDisplay: 'never' })}
                </p>
              }
            />
          )
        })}
      </div>
    </Card>
  )
}
