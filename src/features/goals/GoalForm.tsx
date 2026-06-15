import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { getCurrency } from '@/lib/currencies'
import { amountToMinor, fromMinorUnits } from '@/lib/money'
import { ACCOUNT_COLORS } from '@/features/accounts/meta'
import { useAuth } from '@/features/auth/useAuth'
import { useAccounts } from '@/features/accounts/api'
import { useCreateGoal, useUpdateGoal } from './api'
import type { SavingsGoal } from '@/types/db'

export interface GoalPreset {
  name?: string
  color?: string
}

interface Props {
  open: boolean
  onClose: () => void
  goal?: SavingsGoal | null
  preset?: GoalPreset
}

export function GoalForm({ open, onClose, goal, preset }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={goal ? 'Edit goal' : 'New savings goal'}>
      {open && <GoalFormBody onClose={onClose} goal={goal ?? null} preset={preset} />}
    </Modal>
  )
}

function GoalFormBody({
  onClose,
  goal,
  preset,
}: {
  onClose: () => void
  goal: SavingsGoal | null
  preset?: GoalPreset
}) {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const currency = goal?.currency ?? base
  const symbol = getCurrency(currency).symbol

  const { data: accounts = [] } = useAccounts(true)
  const create = useCreateGoal()
  const update = useUpdateGoal()

  const [name, setName] = useState(goal?.name ?? preset?.name ?? '')
  const [target, setTarget] = useState(goal ? String(fromMinorUnits(goal.target_amount, currency)) : '')
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? '')
  const [accountId, setAccountId] = useState(goal?.account_id ?? '')
  const [color, setColor] = useState(goal?.color ?? preset?.color ?? ACCOUNT_COLORS[0])
  const [error, setError] = useState<string | null>(null)

  const pending = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Name your goal.')
    const targetMinor = amountToMinor(target, currency)
    if (targetMinor <= 0) return setError('Enter a target amount greater than zero.')

    try {
      if (goal) {
        await update.mutateAsync({
          id: goal.id,
          patch: {
            name: name.trim(),
            target_amount: targetMinor,
            target_date: targetDate || null,
            account_id: accountId || null,
            color,
          },
        })
      } else {
        await create.mutateAsync({
          name: name.trim(),
          target_amount: targetMinor,
          currency,
          target_date: targetDate || null,
          account_id: accountId || null,
          color,
          icon: null,
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
          placeholder="e.g. Emergency fund, New laptop, Trip"
          autoFocus
        />
      </Field>

      <Field label="Target amount">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 shadow-sm focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/35">
          <span className="font-numeric text-base font-semibold text-muted-foreground">{symbol}</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0"
            className="h-12 w-full bg-transparent font-numeric text-base font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <span className="text-xs font-semibold text-muted-foreground">{currency}</span>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Target date (optional)">
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </Field>
        <Field label="Linked account (optional)">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">None</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Color">
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              className="h-8 w-8 rounded-full border-2 transition"
              style={{ backgroundColor: c, borderColor: color === c ? 'var(--foreground)' : 'transparent' }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </Field>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={pending}>
          {goal ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  )
}
