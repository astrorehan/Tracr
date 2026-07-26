import { useState } from 'react'
import { format } from 'date-fns'
import { Calendar, CalendarClock, CheckCircle2, History, Pencil, Share2, Trash2, Wallet, Zap } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select, Field } from '@/components/ui/Input'
import { useConfirm } from '@/components/ui/confirm-context'
import { useT } from '@/features/settings/language-context'
import { useAccounts, useBalances } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import { formatMoney } from '@/lib/money'
import { dateLocale } from '@/i18n'
import { cn } from '@/lib/utils'
import {
  calculateProgress,
  calculateRemainingAmount,
  getDaysUntilDue,
  getNextDueDate,
} from './progress'
import { useDeleteInstallment, usePayInstallment } from './api'
import { PaymentHistoryModal } from './PaymentHistoryModal'
import { AmortizationScheduleModal } from './AmortizationScheduleModal'
import { EarlyPayoffModal } from './EarlyPayoffModal'
import type { Installment } from './types'

interface Props {
  installment: Installment
  onEdit: (installment: Installment) => void
}

export function InstallmentCard({ installment, onEdit }: Props) {
  const { t } = useT()
  const confirm = useConfirm()

  const deleteInstallment = useDeleteInstallment()
  const payInstallment = usePayInstallment()

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const expenseCategories = categories.filter((c) => c.kind === 'expense')

  const [historyOpen, setHistoryOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [earlyPayoffOpen, setEarlyPayoffOpen] = useState(false)

  // Quick payment modal states
  const [selectedAccountId, setSelectedAccountId] = useState(installment.account_id ?? '')
  const [selectedCategoryId, setSelectedCategoryId] = useState(installment.category_id ?? '')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))

  const { data: balances = {} } = useBalances()
  const selectedPayAccount = accounts.find((a) => a.id === selectedAccountId)
  const isPayCreditCard = selectedPayAccount?.type === 'credit_card' || selectedPayAccount?.is_liability
  const payAccountBal = selectedAccountId ? (balances[selectedAccountId] ?? selectedPayAccount?.opening_balance ?? 0) : 0
  const payCreditLimit = selectedPayAccount?.credit_limit ?? 0
  const payAvailableLimit = Math.max(0, payCreditLimit + payAccountBal)

  const progressPct = calculateProgress(installment.paid_months, installment.tenor_months)
  const remainingAmount = calculateRemainingAmount(
    installment.total_amount,
    installment.monthly_amount,
    installment.paid_months,
    installment.tenor_months,
    installment.interest_rate,
    installment.interest_type,
  )

  const daysUntilDue = getDaysUntilDue(installment.due_day)
  const nextDueDate = getNextDueDate(installment.due_day)
  const formattedNextDue = format(nextDueDate, 'd MMM yyyy', {
    locale: dateLocale(),
  })

  const isCompleted = installment.status === 'completed' || installment.paid_months >= installment.tenor_months
  const linkedAccount = accounts.find((a) => a.id === installment.account_id)
  const linkedCategory = categories.find((c) => c.id === installment.category_id)

  async function handleDelete() {
    const isOk = await confirm({
      title: t('installments.deleteConfirmTitle', { name: installment.name }),
      message: t('installments.deleteConfirmMsg'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (isOk) {
      void deleteInstallment.mutateAsync(installment.id)
    }
  }

  async function handleConfirmPay() {
    try {
      await payInstallment.mutateAsync({
        installment,
        paid_at: payDate,
        account_id: selectedAccountId || null,
        category_id: selectedCategoryId || null,
      })
      setPayModalOpen(false)
    } catch {
      // Error handled by react-query mutation
    }
  }

  function handleWhatsAppShare() {
    const text = encodeURIComponent(
      `📌 *Pengingat Cicilan Tracr*\n` +
        `Nama: *${installment.name}*\n` +
        `Tagihan Bulan Ini: *${formatMoney(installment.monthly_amount, 'IDR')}*\n` +
        `Jatuh Tempo: *${formattedNextDue}*\n` +
        `Progress: *${installment.paid_months}/${installment.tenor_months} Bulan*`,
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  return (
    <>
      <Card className="group relative overflow-hidden transition-all duration-200 hover:border-primary/40">
        {/* Visual progress bar at top edge */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-surface-muted">
          <div
            className={cn(
              'h-full transition-all duration-500',
              isCompleted
                ? 'bg-emerald-500'
                : progressPct > 75
                  ? 'bg-emerald-500'
                  : progressPct > 40
                    ? 'bg-cyan-500'
                    : 'bg-primary',
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="space-y-4 p-4 pt-5 sm:p-5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="truncate text-base font-bold text-foreground">
                  {installment.name}
                </h3>
                {isCompleted ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t('installments.completed')}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                    {t('installments.badgeProgress', {
                      paid: installment.paid_months,
                      tenor: installment.tenor_months,
                      amount: formatMoney(remainingAmount, 'IDR'),
                    })}
                  </span>
                )}
              </div>

              {/* Linked Metadata */}
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {linkedAccount && (
                  <span className="inline-flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5" />
                    {linkedAccount.name}
                  </span>
                )}
                {linkedCategory && (
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 font-medium">
                    {linkedCategory.name}
                  </span>
                )}
                {installment.interest_type && installment.interest_type !== 'zero' && (
                  <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-bold text-amber-600 dark:text-amber-400">
                    {installment.interest_type === 'flat' ? 'Flat' : 'Anuitas'} {installment.interest_rate}% p.a.
                  </span>
                )}
                {installment.note && (
                  <span className="truncate italic">"{installment.note}"</span>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleWhatsAppShare}
                title="Kirim Reminder WhatsApp"
                className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
              >
                <Share2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setScheduleOpen(true)}
                title={t('installments.schedule')}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              >
                <Calendar className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                title={t('installments.history')}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              >
                <History className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onEdit(installment)}
                title={t('common.edit')}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                title={t('common.delete')}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Amount & Progress Details */}
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-border/60 bg-surface-muted/30 p-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {t('instForm.monthlyAmount')}
              </p>
              <p className="text-base font-extrabold text-foreground">
                {formatMoney(installment.monthly_amount, 'IDR')}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {t('installments.summary.remainingTotal')}
              </p>
              <p className="text-base font-extrabold text-foreground">
                {formatMoney(remainingAmount, 'IDR')}
              </p>
            </div>
          </div>

          {/* Progress Bar & Percentage */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>Progress ({Math.round(progressPct)}%)</span>
              <span>
                {installment.paid_months} / {installment.tenor_months} {t('planning.freq.monthly')}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  isCompleted
                    ? 'bg-emerald-500'
                    : progressPct > 75
                      ? 'bg-emerald-500'
                      : 'bg-cyan-500',
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Due Info & Pay Action */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarClock className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              {isCompleted ? (
                <span>{t('installments.completed')}</span>
              ) : daysUntilDue === 0 ? (
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {t('installments.dueToday', { date: formattedNextDue })}
                </span>
              ) : daysUntilDue < 0 ? (
                <span className="font-bold text-danger">
                  {t('installments.overdue', {
                    days: Math.abs(daysUntilDue),
                    date: formattedNextDue,
                  })}
                </span>
              ) : (
                <span>
                  {t('installments.dueIn', {
                    days: daysUntilDue,
                    date: formattedNextDue,
                  })}
                </span>
              )}
            </div>

            {!isCompleted && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEarlyPayoffOpen(true)}
                  className="gap-1 text-xs text-primary hover:bg-primary-soft"
                >
                  <Zap className="h-3.5 w-3.5" />
                  {t('installments.earlyPayoff')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => setPayModalOpen(true)}
                  disabled={payInstallment.isPending}
                >
                  {payInstallment.isPending
                    ? t('installments.paying')
                    : t('installments.payThisMonth')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Early Payoff Modal */}
      {earlyPayoffOpen && (
        <EarlyPayoffModal
          open={earlyPayoffOpen}
          onClose={() => setEarlyPayoffOpen(false)}
          installment={installment}
        />
      )}

      {/* Amortization Schedule Modal */}
      {scheduleOpen && (
        <AmortizationScheduleModal
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          installment={installment}
        />
      )}

      {/* Payment History Modal */}
      {historyOpen && (
        <PaymentHistoryModal
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          installment={installment}
        />
      )}

      {/* Confirm Payment Modal */}
      {payModalOpen && (
        <Modal
          open={payModalOpen}
          onClose={() => setPayModalOpen(false)}
          title={`${t('installments.payThisMonth')} (${installment.paid_months + 1}/${installment.tenor_months})`}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary-soft/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">{installment.name}</p>
              <p className="text-xl font-extrabold text-primary">
                {formatMoney(installment.monthly_amount, 'IDR')}
              </p>
            </div>

            <Field label={t('instForm.account')}>
              <Select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                <option value="">{t('common.none')} (Catat tanpa potong saldo)</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.is_liability ? '(Kartu Kredit / Pinjaman)' : ''}
                  </option>
                ))}
              </Select>
              {isPayCreditCard && payCreditLimit > 0 && (
                <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  💳 Sisa Limit Kartu Kredit: {formatMoney(payAvailableLimit, 'IDR')} / {formatMoney(payCreditLimit, 'IDR')}
                </p>
              )}
            </Field>

            <Field label={t('instForm.category')}>
              <Select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
              >
                <option value="">{t('common.none')}</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t('common.date')}>
              <input
                type="date"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setPayModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleConfirmPay} disabled={payInstallment.isPending}>
                {payInstallment.isPending ? t('installments.paying') : t('common.done')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
