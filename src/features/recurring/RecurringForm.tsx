import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { getCurrency } from '@/lib/currencies'
import { amountToMinor, fromMinorUnits } from '@/lib/money'
import { useAccounts } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import { flattenWithDepth } from '@/features/categories/tree'
import { FREQ_LABEL } from './schedule'
import { useCreateRecurring, useUpdateRecurring } from './api'
import type { RecurrenceFreq, RecurringTransaction } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  recurring?: RecurringTransaction | null
}

const FREQS: RecurrenceFreq[] = ['weekly', 'monthly', 'yearly']
const KINDS = [
  { value: 'expense', label: 'Bill / expense' },
  { value: 'income', label: 'Income' },
] as const

function todayLocal() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

export function RecurringForm({ open, onClose, recurring }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={recurring ? 'Edit bill' : 'New bill / subscription'}>
      {open && <RecurringFormBody onClose={onClose} recurring={recurring ?? null} />}
    </Modal>
  )
}

function RecurringFormBody({
  onClose,
  recurring,
}: {
  onClose: () => void
  recurring: RecurringTransaction | null
}) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const create = useCreateRecurring()
  const update = useUpdateRecurring()

  const [name, setName] = useState(recurring?.name ?? '')
  const [type, setType] = useState<'expense' | 'income'>(
    recurring?.type === 'income' ? 'income' : 'expense',
  )
  const [accountId, setAccountId] = useState(recurring?.account_id ?? accounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(recurring?.category_id ?? '')
  const [frequency, setFrequency] = useState<RecurrenceFreq>(recurring?.frequency ?? 'monthly')
  const [interval, setIntervalValue] = useState(String(recurring?.interval ?? 1))
  const [nextDue, setNextDue] = useState(recurring?.next_due ?? todayLocal())
  const [note, setNote] = useState(recurring?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const effectiveAccountId = accountId || accounts[0]?.id || ''
  const account = accounts.find((a) => a.id === effectiveAccountId)
  const currency = recurring?.currency ?? account?.currency ?? 'IDR'
  const symbol = getCurrency(currency).symbol

  const [amount, setAmount] = useState(
    recurring ? String(fromMinorUnits(recurring.amount, currency)) : '',
  )

  const categoryOptions = useMemo(
    () => flattenWithDepth(categories.filter((c) => c.kind === type)),
    [categories, type],
  )

  const pending = create.isPending || update.isPending

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add an account first, then you can schedule bills against it.
      </p>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Give this bill a name.')
    if (!effectiveAccountId) return setError('Pick an account.')
    const amountMinor = amountToMinor(amount, currency)
    if (amountMinor <= 0) return setError('Enter an amount greater than zero.')
    const intervalNum = Math.max(1, Math.round(Number(interval) || 1))

    try {
      if (recurring) {
        await update.mutateAsync({
          id: recurring.id,
          patch: {
            name: name.trim(),
            type,
            account_id: effectiveAccountId,
            category_id: categoryId || null,
            amount: amountMinor,
            frequency,
            interval: intervalNum,
            next_due: nextDue,
            note: note.trim() || null,
          },
        })
      } else {
        await create.mutateAsync({
          name: name.trim(),
          type,
          account_id: effectiveAccountId,
          category_id: categoryId || null,
          amount: amountMinor,
          currency,
          frequency,
          interval: intervalNum,
          next_due: nextDue,
          note: note.trim() || null,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Netflix, Rent, Salary"
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setType(k.value)}
            className={cn(
              'rounded-lg py-2 text-sm transition-all duration-200',
              type === k.value
                ? 'bg-surface font-bold text-foreground shadow-sm'
                : 'font-semibold text-muted-foreground hover:text-foreground',
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      <Field label="Amount">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 shadow-sm focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/35">
          <span className="font-numeric text-base font-semibold text-muted-foreground">{symbol}</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="h-12 w-full bg-transparent font-numeric text-base font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <span className="text-xs font-semibold text-muted-foreground">{currency}</span>
        </div>
      </Field>

      <Field label="Account">
        <Select value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Category">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Uncategorized</option>
          {categoryOptions.map(({ category, depth }) => (
            <option key={category.id} value={category.id}>
              {depth ? '  — ' : ''}
              {category.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Repeats">
          <Select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurrenceFreq)}
          >
            {FREQS.map((f) => (
              <option key={f} value={f}>
                {FREQ_LABEL[f]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Every (n periods)">
          <Input
            type="number"
            min={1}
            step={1}
            value={interval}
            onChange={(e) => setIntervalValue(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Next due">
        <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
      </Field>

      <Field label="Note">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
      </Field>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={pending}>
          {recurring ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  )
}
