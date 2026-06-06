import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { CURRENCIES, CURRENCY_CODES } from '@/lib/currencies'
import { amountToMinor, fromMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useCreateAccount, useUpdateAccount } from './api'
import { ACCOUNT_COLORS, ACCOUNT_TYPES, LIABILITY_TYPES } from './meta'
import type { Account, AccountType } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  account?: Account | null
}

export function AccountForm({ open, onClose, account }: Props) {
  // Modal unmounts children when closed, so the body initializes fresh each open.
  return (
    <Modal open={open} onClose={onClose} title={account ? 'Edit account' : 'New account'}>
      {open && <AccountFormBody onClose={onClose} account={account ?? null} />}
    </Modal>
  )
}

function AccountFormBody({ onClose, account }: { onClose: () => void; account: Account | null }) {
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const editing = Boolean(account)

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'cash')
  const [isLiability, setIsLiability] = useState(account?.is_liability ?? false)
  const [currency, setCurrency] = useState(account?.currency ?? 'IDR')
  // For liabilities the opening balance is stored negative; show it as a positive "owed".
  const [opening, setOpening] = useState(
    account ? String(fromMinorUnits(Math.abs(account.opening_balance), account.currency)) : '',
  )
  const [color, setColor] = useState(account?.color ?? ACCOUNT_COLORS[0])
  const [error, setError] = useState<string | null>(null)

  const pending = create.isPending || update.isPending

  // Picking a debt type defaults the liability flag; the user can still override it.
  function changeType(next: AccountType) {
    setType(next)
    setIsLiability(LIABILITY_TYPES.has(next))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please name this account.')
      return
    }
    const magnitude = opening ? amountToMinor(opening, currency) : 0
    // Liabilities carry a negative balance (debt subtracts from net worth).
    const opening_balance = isLiability ? -Math.abs(magnitude) : magnitude
    try {
      if (account) {
        await update.mutateAsync({
          id: account.id,
          patch: { name: name.trim(), type, currency, opening_balance, color, is_liability: isLiability },
        })
      } else {
        await create.mutateAsync({
          name: name.trim(),
          type,
          currency,
          opening_balance,
          color,
          icon: null,
          is_liability: isLiability,
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
          placeholder="e.g. BCA, Cash, GoPay, Binance"
          autoFocus
        />
      </Field>

      <Field label="Type">
        <Select value={type} onChange={(e) => changeType(e.target.value as AccountType)}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>

      <button
        type="button"
        role="switch"
        aria-checked={isLiability}
        onClick={() => setIsLiability((v) => !v)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50"
      >
        <span
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors',
            isLiability ? 'bg-danger' : 'bg-surface-muted',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
              isLiability ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
            )}
          />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">This is a liability</span>
          <span className="block text-[11px] font-medium text-muted-foreground">
            {isLiability
              ? 'Money you owe — its balance subtracts from net worth.'
              : 'A debt like a credit card or loan? Turn this on.'}
          </span>
        </span>
      </button>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Currency">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {code} — {CURRENCIES[code].symbol}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={isLiability ? 'Amount owed now' : 'Opening balance'}>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            placeholder="0"
          />
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
              style={{
                backgroundColor: c,
                borderColor: color === c ? 'var(--foreground)' : 'transparent',
              }}
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
          {editing ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  )
}
