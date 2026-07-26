import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { useT } from '@/features/settings/language-context'
import { useAccounts } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import { useAuth } from '@/features/auth/useAuth'
import { getCurrency } from '@/lib/currencies'
import { amountToMinor, formatMoney, fromMinorUnits } from '@/lib/money'
import { useCreateInstallment, useUpdateInstallment } from './api'
import { calculateMonthlyPayment, generateAmortizationSchedule } from './progress'
import type { Installment, InterestType } from './types'

interface Props {
  open: boolean
  onClose: () => void
  installmentToEdit?: Installment | null
}

export function InstallmentForm({ open, onClose, installmentToEdit }: Props) {
  const { t } = useT()
  const title = installmentToEdit ? t('instForm.edit') : t('instForm.new')

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {open && <InstallmentFormBody onClose={onClose} installmentToEdit={installmentToEdit} />}
    </Modal>
  )
}

function InstallmentFormBody({
  onClose,
  installmentToEdit,
}: {
  onClose: () => void
  installmentToEdit?: Installment | null
}) {
  const { t } = useT()
  const { profile } = useAuth()
  const currency = profile?.base_currency ?? 'IDR'
  const symbol = getCurrency(currency).symbol

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const expenseCategories = categories.filter((c) => c.kind === 'expense')

  const createInstallment = useCreateInstallment()
  const updateInstallment = useUpdateInstallment()

  const [name, setName] = useState(installmentToEdit?.name ?? '')
  const [accountId, setAccountId] = useState(installmentToEdit?.account_id ?? '')
  const [categoryId, setCategoryId] = useState(installmentToEdit?.category_id ?? '')
  const [totalAmountStr, setTotalAmountStr] = useState(
    installmentToEdit ? String(fromMinorUnits(installmentToEdit.total_amount, currency)) : '',
  )
  const [tenorMonths, setTenorMonths] = useState<number>(installmentToEdit?.tenor_months ?? 12)
  const [interestType, setInterestType] = useState<InterestType>(
    installmentToEdit?.interest_type ?? 'zero',
  )
  const [interestRate, setInterestRate] = useState<number>(
    installmentToEdit?.interest_rate ?? 0,
  )
  const [monthlyAmountStr, setMonthlyAmountStr] = useState(
    installmentToEdit ? String(fromMinorUnits(installmentToEdit.monthly_amount, currency)) : '',
  )
  const [startDate, setStartDate] = useState(
    installmentToEdit?.start_date ?? new Date().toISOString().slice(0, 10),
  )
  const [dueDay, setDueDay] = useState<number>(installmentToEdit?.due_day ?? 10)
  const [paidMonths, setPaidMonths] = useState<number>(installmentToEdit?.paid_months ?? 0)
  const [note, setNote] = useState(installmentToEdit?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isManualMonthly, setIsManualMonthly] = useState(false)

  // Automatic calculation of monthly_amount based on interest method
  useEffect(() => {
    if (isManualMonthly || !totalAmountStr || tenorMonths <= 0) return
    const totalMinor = amountToMinor(totalAmountStr, currency)
    if (totalMinor > 0) {
      const calculatedMonthlyMinor = calculateMonthlyPayment(
        totalMinor,
        tenorMonths,
        interestRate,
        interestType,
      )
      setMonthlyAmountStr(String(fromMinorUnits(calculatedMonthlyMinor, currency)))
    }
  }, [totalAmountStr, tenorMonths, interestRate, interestType, currency, isManualMonthly])

  // Live Summary Preview Calculations
  const previewStats = useMemo(() => {
    const totalMinor = amountToMinor(totalAmountStr, currency)
    const monthlyMinor = amountToMinor(monthlyAmountStr, currency)
    if (totalMinor <= 0 || tenorMonths <= 0) return null

    const sched = generateAmortizationSchedule({
      start_date: startDate || '2026-01-01',
      due_day: dueDay || 1,
      tenor_months: tenorMonths,
      total_amount: totalMinor,
      monthly_amount: monthlyMinor,
      paid_months: paidMonths,
      interest_rate: interestRate,
      interest_type: interestType,
    })

    const totalInterest = sched.reduce((sum, r) => sum + r.interestAmount, 0)
    const totalPayable = totalMinor + totalInterest

    return {
      totalPrincipal: totalMinor,
      totalInterest,
      totalPayable,
    }
  }, [totalAmountStr, monthlyAmountStr, tenorMonths, interestRate, interestType, currency, startDate, dueDay, paidMonths])

  const pending = createInstallment.isPending || updateInstallment.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) return setError(t('instForm.errName'))
    const totalMinor = amountToMinor(totalAmountStr, currency)
    if (totalMinor <= 0) return setError(t('instForm.errAmount'))
    if (tenorMonths <= 0) return setError(t('instForm.errTenor'))
    if (dueDay < 1 || dueDay > 31) return setError(t('instForm.errDueDay'))

    const monthlyMinor =
      amountToMinor(monthlyAmountStr, currency) ||
      calculateMonthlyPayment(totalMinor, tenorMonths, interestRate, interestType)

    try {
      if (installmentToEdit) {
        await updateInstallment.mutateAsync({
          id: installmentToEdit.id,
          name: name.trim(),
          account_id: accountId || null,
          category_id: categoryId || null,
          total_amount: totalMinor,
          tenor_months: tenorMonths,
          monthly_amount: monthlyMinor,
          interest_rate: interestType === 'zero' ? 0 : interestRate,
          interest_type: interestType,
          start_date: startDate,
          due_day: dueDay,
          paid_months: paidMonths,
          note: note.trim() || null,
        })
      } else {
        await createInstallment.mutateAsync({
          name: name.trim(),
          account_id: accountId || null,
          category_id: categoryId || null,
          total_amount: totalMinor,
          tenor_months: tenorMonths,
          monthly_amount: monthlyMinor,
          interest_rate: interestType === 'zero' ? 0 : interestRate,
          interest_type: interestType,
          start_date: startDate,
          due_day: dueDay,
          paid_months: paidMonths,
          note: note.trim() || null,
        })
      }
      onClose()
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || t('instForm.errSaveFailed')
      setError(msg)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-semibold text-danger">
          {error}
        </div>
      )}

      <Field label={t('instForm.name')}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('instForm.namePlaceholder')}
          required
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('instForm.totalAmount')}>
          <div className="relative flex items-center">
            <span className="absolute left-3 text-sm font-semibold text-muted-foreground">
              {symbol}
            </span>
            <Input
              type="text"
              inputMode="decimal"
              className="pl-8"
              value={totalAmountStr}
              onChange={(e) => {
                setIsManualMonthly(false)
                setTotalAmountStr(e.target.value)
              }}
              placeholder="12.000.000"
              required
            />
          </div>
        </Field>

        <Field label={t('instForm.tenor')}>
          <Input
            type="number"
            min={1}
            max={360}
            value={tenorMonths}
            onChange={(e) => {
              setIsManualMonthly(false)
              setTenorMonths(parseInt(e.target.value, 10) || 1)
            }}
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('instForm.interestType')}>
          <Select
            value={interestType}
            onChange={(e) => {
              setIsManualMonthly(false)
              setInterestType(e.target.value as InterestType)
            }}
          >
            <option value="zero">{t('instForm.interestZero')}</option>
            <option value="flat">{t('instForm.interestFlat')}</option>
            <option value="annuity">{t('instForm.interestAnnuity')}</option>
          </Select>
        </Field>

        {interestType !== 'zero' && (
          <Field label={t('instForm.interestRate')}>
            <Input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={interestRate}
              onChange={(e) => {
                setIsManualMonthly(false)
                setInterestRate(parseFloat(e.target.value) || 0)
              }}
              placeholder="5.0"
              required
            />
          </Field>
        )}
      </div>

      <Field label={t('instForm.monthlyAmount')}>
        <div className="relative flex items-center">
          <span className="absolute left-3 text-sm font-semibold text-muted-foreground">
            {symbol}
          </span>
          <Input
            type="text"
            inputMode="decimal"
            className="pl-8"
            value={monthlyAmountStr}
            onChange={(e) => {
              setIsManualMonthly(true)
              setMonthlyAmountStr(e.target.value)
            }}
            placeholder="1.000.000"
            required
          />
        </div>
      </Field>

      {/* Live Summary Preview Box */}
      {previewStats && (
        <div className="rounded-xl border border-primary/20 bg-primary-soft/30 p-3 text-xs space-y-1.5">
          <div className="flex justify-between font-semibold">
            <span className="text-muted-foreground">Total Pokok:</span>
            <span className="text-foreground">{formatMoney(previewStats.totalPrincipal, currency)}</span>
          </div>
          {interestType !== 'zero' && (
            <div className="flex justify-between font-semibold">
              <span className="text-muted-foreground">Total Bunga ({tenorMonths} bln):</span>
              <span className="text-amber-600 dark:text-amber-400">+{formatMoney(previewStats.totalInterest, currency)}</span>
            </div>
          )}
          <div className="flex justify-between font-extrabold border-t border-primary/10 pt-1">
            <span className="text-primary">Total Estimasi Pelunasan:</span>
            <span className="text-primary">{formatMoney(previewStats.totalPayable, currency)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('instForm.startDate')}>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </Field>

        <Field label={t('instForm.dueDay')}>
          <Input
            type="number"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(parseInt(e.target.value, 10) || 1)}
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('instForm.account')}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t('common.none')}</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('instForm.category')}>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('common.none')}</option>
            {expenseCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {installmentToEdit && (
        <Field label={t('instForm.paidMonths')}>
          <Input
            type="number"
            min={0}
            max={tenorMonths}
            value={paidMonths}
            onChange={(e) => setPaidMonths(parseInt(e.target.value, 10) || 0)}
          />
        </Field>
      )}

      <Field label={t('instForm.note')}>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('common.optional')}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  )
}
