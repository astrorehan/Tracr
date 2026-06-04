import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { getCurrency } from '@/lib/currencies'
import { amountToMinor, fromMinorUnits } from '@/lib/money'
import { useAuth } from '@/features/auth/useAuth'
import { useCategories } from '@/features/categories/api'
import { flattenWithDepth } from '@/features/categories/tree'
import { PERIOD_LABEL } from './progress'
import { useCreateBudget, useUpdateBudget } from './api'
import type { Budget, BudgetPeriod } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  budget?: Budget | null
}

const PERIODS: BudgetPeriod[] = ['weekly', 'monthly', 'yearly']

export function BudgetForm({ open, onClose, budget }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={budget ? 'Edit budget' : 'New budget'}>
      {open && <BudgetFormBody onClose={onClose} budget={budget ?? null} />}
    </Modal>
  )
}

function BudgetFormBody({ onClose, budget }: { onClose: () => void; budget: Budget | null }) {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const currency = budget?.currency ?? base
  const symbol = getCurrency(currency).symbol

  const { data: categories = [] } = useCategories()
  const create = useCreateBudget()
  const update = useUpdateBudget()

  const expenseCategories = useMemo(
    () => flattenWithDepth(categories.filter((c) => c.kind === 'expense')),
    [categories],
  )

  const [categoryId, setCategoryId] = useState(budget?.category_id ?? '')
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? 'monthly')
  const [amount, setAmount] = useState(
    budget ? String(fromMinorUnits(budget.amount, currency)) : '',
  )
  const [rollover, setRollover] = useState(budget?.rollover ?? false)
  const [error, setError] = useState<string | null>(null)

  const pending = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amountMinor = amountToMinor(amount, currency)
    if (amountMinor <= 0) return setError('Enter a budget amount greater than zero.')

    try {
      if (budget) {
        await update.mutateAsync({
          id: budget.id,
          patch: { category_id: categoryId || null, period, amount: amountMinor, rollover },
        })
      } else {
        await create.mutateAsync({
          category_id: categoryId || null,
          period,
          amount: amountMinor,
          currency,
          rollover,
        })
      }
      onClose()
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes('duplicate')
          ? 'You already have a budget for that category and period.'
          : err instanceof Error
            ? err.message
            : 'Something went wrong.'
      setError(message)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Category">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Overall — all spending</option>
          {expenseCategories.map(({ category, depth }) => (
            <option key={category.id} value={category.id}>
              {depth ? '  — ' : ''}
              {category.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Period">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-muted p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-lg py-2 text-sm transition-all duration-200',
                period === p
                  ? 'bg-surface font-bold text-foreground shadow-sm'
                  : 'font-semibold text-muted-foreground hover:text-foreground',
              )}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Limit">
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
          <span className="text-xs font-semibold text-muted-foreground">{currency}</span>
        </div>
      </Field>

      <button
        type="button"
        onClick={() => setRollover((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-left shadow-sm transition hover:bg-surface-muted"
      >
        <span>
          <span className="block text-sm font-semibold text-foreground">Roll over unused budget</span>
          <span className="block text-xs text-muted-foreground">
            Carry what you don’t spend into the next period
          </span>
        </span>
        <span
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors',
            rollover ? 'bg-primary' : 'bg-border',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
              rollover ? 'translate-x-[22px]' : 'translate-x-0.5',
            )}
          />
        </span>
      </button>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={pending}>
          {budget ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  )
}
