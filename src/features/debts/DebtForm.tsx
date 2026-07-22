import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { getCurrency } from '@/lib/currencies'
import { amountToMinor } from '@/lib/money'
import { useAuth } from '@/features/auth/useAuth'
import { useContacts, useCreateContact, useCreateDebt } from './api'
import type { DebtDirection } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
}

export function DebtForm({ open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="New record">
      {open && <DebtFormBody onClose={onClose} />}
    </Modal>
  )
}

function DebtFormBody({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth()
  const currency = profile?.base_currency ?? 'IDR'
  const symbol = getCurrency(currency).symbol

  const { data: contacts = [] } = useContacts()
  const createContact = useCreateContact()
  const createDebt = useCreateDebt()

  const [direction, setDirection] = useState<DebtDirection>('receivable')
  const [contactId, setContactId] = useState('') // '' = add a new person
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pending = createContact.isPending || createDebt.isPending
  const whoLabel = direction === 'receivable' ? 'Customer' : 'Supplier'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amountMinor = amountToMinor(amount, currency)
    if (amountMinor <= 0) return setError('Enter an amount greater than zero.')
    if (!contactId && !newName.trim()) return setError(`Add who this ${whoLabel.toLowerCase()} is.`)

    try {
      let resolvedContactId: string | null = contactId || null
      if (!resolvedContactId) {
        const contact = await createContact.mutateAsync({
          name: newName.trim(),
          phone: newPhone.trim() || null,
          kind: direction === 'receivable' ? 'customer' : 'supplier',
        })
        resolvedContactId = contact.id
      }

      await createDebt.mutateAsync({
        contact_id: resolvedContactId,
        direction,
        amount: amountMinor,
        currency,
        due_date: dueDate || null,
        note: note.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Type">
        <Segmented
          value={direction}
          onChange={(v) => {
            setDirection(v)
            setContactId('')
          }}
          options={[
            { value: 'receivable', label: 'They owe me' },
            { value: 'payable', label: 'I owe them' },
          ]}
          aria-label="Debt direction"
        />
      </Field>

      <Field label={whoLabel}>
        <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">＋ Add someone new</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.phone ? ` · ${c.phone}` : ''}
            </option>
          ))}
        </Select>
      </Field>

      {!contactId && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Bu Sari"
              autoFocus
            />
          </Field>
          <Field label="Phone (optional)">
            <Input
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="08…"
            />
          </Field>
        </div>
      )}

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Due date (optional)">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Note (optional)">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. 2 sacks of rice"
          />
        </Field>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  )
}
