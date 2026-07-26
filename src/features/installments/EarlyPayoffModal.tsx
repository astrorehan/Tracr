import { useMemo, useState } from 'react'
import { Zap } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { useT } from '@/features/settings/language-context'
import { useAccounts, useBalances } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import { formatMoney } from '@/lib/money'
import { useEarlyPayoffInstallment } from './api'
import { generateAmortizationSchedule } from './progress'
import type { Installment } from './types'

interface Props {
  open: boolean
  onClose: () => void
  installment: Installment
}

export function EarlyPayoffModal({ open, onClose, installment }: Props) {
  const { t } = useT()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t('installments.earlyPayoff')} - ${installment.name}`}
    >
      {open && <EarlyPayoffBody onClose={onClose} installment={installment} />}
    </Modal>
  )
}

function EarlyPayoffBody({
  onClose,
  installment,
}: {
  onClose: () => void
  installment: Installment
}) {
  const { t } = useT()
  const earlyPayoff = useEarlyPayoffInstallment()

  const { data: accounts = [] } = useAccounts()
  const { data: balances = {} } = useBalances()
  const { data: categories = [] } = useCategories()
  const expenseCategories = categories.filter((c) => c.kind === 'expense')

  const remainingMonths = Math.max(1, installment.tenor_months - installment.paid_months)
  const [monthsToPay, setMonthsToPay] = useState<number>(remainingMonths)
  const [accountId, setAccountId] = useState(installment.account_id ?? '')
  const [categoryId, setCategoryId] = useState(installment.category_id ?? '')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))

  const totalAmountToPay = installment.monthly_amount * monthsToPay
  const isFullPayoff = monthsToPay === remainingMonths

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const isCreditCard = selectedAccount?.type === 'credit_card' || selectedAccount?.is_liability
  const accountBal = accountId ? (balances[accountId] ?? selectedAccount?.opening_balance ?? 0) : 0
  const creditLimit = selectedAccount?.credit_limit ?? 0
  const availableLimit = Math.max(0, creditLimit + accountBal)

  // Interest breakdown for settlement
  const { totalPrincipalInSettlement, totalInterestInSettlement } = useMemo(() => {
    const sched = generateAmortizationSchedule(installment)
    const rows = sched.slice(installment.paid_months, installment.paid_months + monthsToPay)
    const pSum = rows.reduce((sum, r) => sum + r.principalAmount, 0)
    const iSum = rows.reduce((sum, r) => sum + r.interestAmount, 0)
    return { totalPrincipalInSettlement: pSum, totalInterestInSettlement: iSum }
  }, [installment, monthsToPay])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await earlyPayoff.mutateAsync({
        installment,
        monthsToPay,
        paid_at: payDate,
        account_id: accountId || null,
        category_id: categoryId || null,
      })
      onClose()
    } catch {
      // Handled by react-query mutation
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Dynamic Summary Card */}
      <div className="rounded-2xl border border-primary/25 bg-primary-soft/40 p-4 text-center">
        <p className="text-xs font-medium text-muted-foreground">
          {t('installments.totalPayoffAmount')}
        </p>
        <p className="mt-1 text-2xl font-black text-primary">
          {formatMoney(totalAmountToPay, 'IDR')}
        </p>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          {t('installments.payingCount', {
            count: monthsToPay,
            from: installment.paid_months + 1,
            to: installment.paid_months + monthsToPay,
            total: installment.tenor_months,
          })}
        </p>
        {installment.interest_type && installment.interest_type !== 'zero' && (
          <div className="mt-2 text-[11px] font-semibold text-muted-foreground border-t border-primary/10 pt-2 flex justify-center gap-3">
            <span>Pokok: <strong className="text-emerald-600 dark:text-emerald-400">{formatMoney(totalPrincipalInSettlement, 'IDR')}</strong></span>
            <span>Bunga: <strong className="text-amber-600 dark:text-amber-400">{formatMoney(totalInterestInSettlement, 'IDR')}</strong></span>
          </div>
        )}
      </div>

      {/* Quick 100% Payoff Button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setMonthsToPay(remainingMonths)}
          className="pressable inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-surface px-4 py-1.5 text-xs font-bold text-primary hover:bg-primary-soft"
        >
          <Zap className="h-3.5 w-3.5" />
          {t('installments.fullPayoff', { months: remainingMonths })}
        </button>
      </div>

      {/* Select Number of Months */}
      <Field label={t('installments.selectMonths')}>
        <div className="space-y-2">
          <Input
            type="number"
            min={1}
            max={remainingMonths}
            value={monthsToPay}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10) || 1
              setMonthsToPay(Math.min(remainingMonths, Math.max(1, val)))
            }}
            required
          />
          <input
            type="range"
            min={1}
            max={remainingMonths}
            value={monthsToPay}
            onChange={(e) => setMonthsToPay(parseInt(e.target.value, 10))}
            className="w-full accent-primary"
          />
        </div>
      </Field>

      <Field label={t('instForm.account')}>
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">{t('common.none')} (Catat tanpa potong saldo)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} {a.is_liability ? '(Kartu Kredit / Pinjaman)' : ''}
            </option>
          ))}
        </Select>
        {isCreditCard && creditLimit > 0 && (
          <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            💳 Sisa Limit Kartu Kredit: {formatMoney(availableLimit, 'IDR')} / {formatMoney(creditLimit, 'IDR')}
          </p>
        )}
      </Field>

      <Field label={t('instForm.category')}>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t('common.none')}</option>
          {expenseCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('common.date')}>
        <Input
          type="date"
          value={payDate}
          onChange={(e) => setPayDate(e.target.value)}
          required
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={earlyPayoff.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={earlyPayoff.isPending}>
          {earlyPayoff.isPending
            ? t('installments.paying')
            : isFullPayoff
              ? t('installments.processFullPayoff')
              : t('installments.processEarlyPayoff')}
        </Button>
      </div>
    </form>
  )
}
