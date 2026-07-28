import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { useT } from '@/features/settings/language-context'
import { getCurrency } from '@/lib/currencies'
import { amountToMinor, fromMinorUnits, formatMoney } from '@/lib/money'
import { useAccounts } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import { useRecordPayment } from './api'
import type { DebtWithContact } from './api'

interface Props {
  open: boolean
  onClose: () => void
  debt: DebtWithContact | null
}

export function PaymentForm({ open, onClose, debt }: Props) {
  const { t } = useT()
  return (
    <Modal open={open} onClose={onClose} title={t('pay.title')}>
      {open && debt && <PaymentFormBody onClose={onClose} debt={debt} />}
    </Modal>
  )
}

function PaymentFormBody({ onClose, debt }: { onClose: () => void; debt: DebtWithContact }) {
  const { t } = useT()
  const remaining = Math.max(0, debt.amount - debt.paid)
  const symbol = getCurrency(debt.currency).symbol

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const record = useRecordPayment()

  const kind = debt.direction === 'receivable' ? 'income' : 'expense'
  const filteredCategories = categories.filter((c) => c.kind === kind && !c.is_archived)

  const [amount, setAmount] = useState(String(fromMinorUnits(remaining, debt.currency)))
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amountMinor = amountToMinor(amount, debt.currency)
    if (amountMinor <= 0) return setError(t('pay.errPos'))
    if (amountMinor > remaining) {
      return setError(t('pay.errTooMuch', { amount: formatMoney(remaining, debt.currency) }))
    }

    try {
      await record.mutateAsync({
        debt,
        amount: amountMinor,
        paid_on: paidOn,
        note: note.trim() || null,
        account_id: accountId || null,
        category_id: categoryId || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('acc.form.errGeneric'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm font-medium text-muted-foreground">
        {t('pay.leftOf', {
          name: debt.contact?.name ?? '—',
          remaining: formatMoney(remaining, debt.currency, { signDisplay: 'never' }),
          amount: formatMoney(debt.amount, debt.currency, { signDisplay: 'never' }),
        })}
      </p>

      <Field label={t('pay.amount')}>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 shadow-sm focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/35">
          <span className="font-numeric text-base font-semibold text-muted-foreground">{symbol}</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
            className="h-12 w-full bg-transparent font-numeric text-base font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <span className="text-xs font-semibold text-muted-foreground">{debt.currency}</span>
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('pay.accountSelect')}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t('pay.noAccount')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('pay.categorySelect')}>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('pay.categoryDefault')}</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('common.date')}>
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <Field label={t('pay.note')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('pay.notePh')} />
        </Field>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" className="flex-1" loading={record.isPending}>
          {t('pay.save')}
        </Button>
      </div>
    </form>
  )
}
