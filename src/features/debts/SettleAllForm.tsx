import { useState } from 'react'
import { format } from 'date-fns'
import { CheckCheck } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { useT } from '@/features/settings/language-context'
import { dateLocale } from '@/i18n'
import { formatMoney } from '@/lib/money'
import { useAccounts } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import { useSettleAllDebts } from './api'
import { avatarColor } from './wa'
import type { DebtWithContact } from './api'

interface Props {
  open: boolean
  onClose: () => void
  /** Every open note for one person, in one direction. */
  debts: DebtWithContact[]
  name: string
}

/** Close out all of one person's open notes at once — several tabs, one payment. */
export function SettleAllForm({ open, onClose, debts, name }: Props) {
  const { t } = useT()
  return (
    <Modal open={open} onClose={onClose} title={t('settle.title')}>
      {open && debts.length > 0 && (
        <SettleAllBody onClose={onClose} debts={debts} name={name} />
      )}
    </Modal>
  )
}

function SettleAllBody({
  onClose,
  debts,
  name,
}: {
  onClose: () => void
  debts: DebtWithContact[]
  name: string
}) {
  const { t } = useT()
  const currency = debts[0].currency
  const isRcv = debts[0].direction === 'receivable'
  const rows = debts.map((d) => ({ debt: d, remaining: Math.max(0, d.amount - d.paid) }))
  const total = rows.reduce((s, r) => s + r.remaining, 0)

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const settle = useSettleAllDebts()

  const kind = isRcv ? 'income' : 'expense'
  const filteredCategories = categories.filter((c) => c.kind === kind && !c.is_archived)

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await settle.mutateAsync({
        debts,
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
      {/* Who and how much, so the number is never a surprise */}
      <div className="flex items-center gap-3 rounded-2xl bg-surface-muted px-4 py-3.5">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold text-white"
          style={{ backgroundColor: avatarColor(name) }}
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold tracking-tight">{name}</p>
          <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
            {t('settle.count', { n: rows.length })}
          </p>
        </div>
        <span className="shrink-0 font-numeric text-[19px] font-extrabold tracking-tight">
          {formatMoney(total, currency, { signDisplay: 'never' })}
        </span>
      </div>

      {/* The notes being closed — read-only receipt */}
      <div className="rounded-2xl border border-border">
        <div className="divide-y divide-dashed divide-border">
          {rows.map(({ debt, remaining }) => (
            <div key={debt.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{debt.note || t('debt.noNote')}</p>
                <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                  {format(new Date(debt.due_date ?? debt.created_at), 'd MMM yyyy', {
                    locale: dateLocale(),
                  })}
                </p>
              </div>
              <span className="shrink-0 font-numeric text-[13px] font-bold">
                {formatMoney(remaining, currency, { signDisplay: 'never' })}
              </span>
            </div>
          ))}
        </div>
        <p className="border-t border-border px-4 py-2.5 text-[11.5px] font-medium text-muted-foreground">
          {t('settle.oneEntry')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        <Button type="submit" className="flex-1" loading={settle.isPending}>
          <CheckCheck className="h-[18px] w-[18px]" />
          {t('settle.confirm', {
            amount: formatMoney(total, currency, { signDisplay: 'never' }),
          })}
        </Button>
      </div>
    </form>
  )
}
