import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { CURRENCIES, CURRENCY_CODES } from '@/lib/currencies'
import { amountToMinor, fromMinorUnits } from '@/lib/money'
import { useCreateAccount, useUpdateAccount } from './api'
import { ACCOUNT_COLORS, ACCOUNT_TYPES } from './meta'
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
  const [currency, setCurrency] = useState(account?.currency ?? 'IDR')
  const [opening, setOpening] = useState(
    account ? String(fromMinorUnits(account.opening_balance, account.currency)) : '',
  )
  const [color, setColor] = useState(account?.color ?? ACCOUNT_COLORS[0])
  const [error, setError] = useState<string | null>(null)

  const pending = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please name this account.')
      return
    }
    const opening_balance = opening ? amountToMinor(opening, currency) : 0
    try {
      if (account) {
        await update.mutateAsync({
          id: account.id,
          patch: { name: name.trim(), type, currency, opening_balance, color },
        })
      } else {
        await create.mutateAsync({
          name: name.trim(),
          type,
          currency,
          opening_balance,
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
          placeholder="e.g. BCA, Cash, GoPay, Binance"
          autoFocus
        />
      </Field>

      <Field label="Type">
        <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>

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
        <Field label="Opening balance">
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
