import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { getCurrency } from '@/lib/currencies'
import { amountToMinor } from '@/lib/money'
import { useAddContribution } from './api'
import type { SavingsGoal } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  goal: SavingsGoal | null
}

function todayLocal() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

export function ContributeForm({ open, onClose, goal }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={goal ? goal.name : 'Add money'}>
      {open && goal && <ContributeFormBody onClose={onClose} goal={goal} />}
    </Modal>
  )
}

function ContributeFormBody({ onClose, goal }: { onClose: () => void; goal: SavingsGoal }) {
  const add = useAddContribution()
  const symbol = getCurrency(goal.currency).symbol

  const [direction, setDirection] = useState<'deposit' | 'withdraw'>('deposit')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const minor = amountToMinor(amount, goal.currency)
    if (minor <= 0) return setError('Enter an amount greater than zero.')

    try {
      await add.mutateAsync({
        goal_id: goal.id,
        amount: direction === 'withdraw' ? -minor : minor,
        note: note.trim() || null,
        occurred_at: new Date(`${date}T12:00:00`).toISOString(),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1">
        {(['deposit', 'withdraw'] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={cn(
              'rounded-lg py-2 text-sm capitalize transition-all duration-200',
              direction === d
                ? 'bg-surface font-bold text-foreground shadow-sm'
                : 'font-semibold text-muted-foreground hover:text-foreground',
            )}
          >
            {d === 'deposit' ? 'Add money' : 'Withdraw'}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-surface-muted p-5 text-center">
        <div className="flex items-center justify-center gap-1.5 font-numeric text-4xl font-extrabold">
          <span className="text-muted-foreground">{symbol}</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
            className="w-44 bg-transparent text-center outline-none placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" className="w-full" size="lg" loading={add.isPending}>
        {direction === 'deposit' ? 'Add to goal' : 'Withdraw'}
      </Button>
    </form>
  )
}
