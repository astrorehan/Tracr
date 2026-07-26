import { useState } from 'react'
import { format } from 'date-fns'
import { Calendar, Check, CheckCircle2, Clock, Copy } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CenterSpinner } from '@/components/ui/States'
import { useT } from '@/features/settings/language-context'
import { formatMoney } from '@/lib/money'
import { dateLocale } from '@/i18n'
import { cn } from '@/lib/utils'
import { useInstallmentPayments } from './api'
import { generateAmortizationSchedule } from './progress'
import type { Installment } from './types'

interface Props {
  open: boolean
  onClose: () => void
  installment: Installment
}

export function AmortizationScheduleModal({ open, onClose, installment }: Props) {
  const { t } = useT()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t('installments.schedule')} - ${installment.name}`}
    >
      {open && <AmortizationScheduleBody installment={installment} />}
    </Modal>
  )
}

function AmortizationScheduleBody({ installment }: { installment: Installment }) {
  const { t } = useT()
  const { data: payments = [], isLoading } = useInstallmentPayments(installment.id)
  const [copied, setCopied] = useState(false)

  const schedule = generateAmortizationSchedule(installment, payments)
  const totalInterest = schedule.reduce((sum, row) => sum + row.interestAmount, 0)

  function handleCopySchedule() {
    let text = `📅 *Jadwal Amortisasi Cicilan: ${installment.name}*\n`
    text += `Total Pokok: ${formatMoney(installment.total_amount, 'IDR')}\n`
    text += `Total Bunga: ${formatMoney(totalInterest, 'IDR')}\n`
    text += `Tenor: ${installment.tenor_months} Bulan\n\n`
    text += `Bulan | Tanggal | Total | Pokok | Bunga | Sisa | Status\n`

    schedule.forEach((row) => {
      const d = format(row.dueDate, 'dd/MM/yyyy')
      const statusStr = row.isPaid ? 'Lunas' : row.isNext ? 'Tempo Berikutnya' : 'Mendatang'
      text += `Bln #${row.monthNumber} | ${d} | ${formatMoney(row.amount, 'IDR')} | ${formatMoney(row.principalAmount, 'IDR')} | ${formatMoney(row.interestAmount, 'IDR')} | ${formatMoney(row.remainingPrincipal, 'IDR')} | ${statusStr}\n`
    })

    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <CenterSpinner />
      </div>
    )
  }

  const interestLabel =
    installment.interest_type === 'flat'
      ? `Flat ${installment.interest_rate ?? 0}%`
      : installment.interest_type === 'annuity'
        ? `Anuitas ${installment.interest_rate ?? 0}%`
        : t('instForm.interestZero')

  return (
    <div className="space-y-4 py-2">
      {/* Overview strip */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 bg-surface-muted/40 p-3 text-center text-xs sm:grid-cols-4">
        <div>
          <span className="text-muted-foreground">{t('instForm.totalAmount')}</span>
          <p className="mt-0.5 font-extrabold text-foreground">
            {formatMoney(installment.total_amount, 'IDR')}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">{t('installments.totalInterest')}</span>
          <p className="mt-0.5 font-extrabold text-amber-600 dark:text-amber-400">
            {formatMoney(totalInterest, 'IDR')} ({interestLabel})
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">{t('instForm.tenor')}</span>
          <p className="mt-0.5 font-extrabold text-foreground">
            {installment.tenor_months} {t('planning.freq.monthly')}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">{t('instForm.monthlyAmount')}</span>
          <p className="mt-0.5 font-extrabold text-cyan-600 dark:text-cyan-400">
            {formatMoney(installment.monthly_amount, 'IDR')}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={handleCopySchedule}
          className="pressable inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Teks Jadwal Disalin!' : 'Salin Teks Jadwal'}
        </Button>
      </div>

      {/* Amortization Table */}
      <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-border bg-surface-muted px-3 py-2 font-bold text-muted-foreground">
            <tr>
              <th className="p-3">{t('common.date')}</th>
              <th className="p-3 text-right">{t('common.amount')}</th>
              <th className="p-3 text-right">{t('installments.principal')}</th>
              <th className="p-3 text-right">{t('installments.interest')}</th>
              <th className="p-3 text-right">{t('installments.remainingAfter')}</th>
              <th className="p-3 text-center">{t('common.type')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {schedule.map((row) => {
              const formattedDate = format(row.dueDate, 'd MMM yyyy', {
                locale: dateLocale(),
              })

              return (
                <tr
                  key={row.monthNumber}
                  className={cn(
                    'transition-colors hover:bg-surface-muted/50',
                    row.isNext && 'bg-primary-soft/30 font-semibold',
                  )}
                >
                  <td className="p-3">
                    <div className="font-bold text-foreground">
                      {t('installments.month', { n: row.monthNumber })}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{formattedDate}</div>
                    {row.paidAt && (
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        {t('installments.statusPaid')}: {row.paidAt}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right font-bold text-foreground">
                    {formatMoney(row.amount, 'IDR')}
                  </td>
                  <td className="p-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                    {formatMoney(row.principalAmount, 'IDR')}
                  </td>
                  <td className="p-3 text-right font-medium text-amber-600 dark:text-amber-400">
                    {formatMoney(row.interestAmount, 'IDR')}
                  </td>
                  <td className="p-3 text-right font-medium text-muted-foreground">
                    {formatMoney(row.remainingPrincipal, 'IDR')}
                  </td>
                  <td className="p-3 text-center">
                    {row.isPaid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {t('installments.statusPaid')}
                      </span>
                    ) : row.isNext ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary">
                        <Clock className="h-3 w-3" />
                        {t('installments.statusNext')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 font-medium text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {t('installments.statusUpcoming')}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
