import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { useT } from '@/features/settings/language-context'
import { getCurrency } from '@/lib/currencies'
import { amountToMinor } from '@/lib/money'
import { useAuth } from '@/features/auth/useAuth'
import { useContacts, useCreateContact, useCreateDebt } from './api'
import type { DebtDirection } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  /** Preselect "they owe me" vs "I owe them" from the page's active filter. */
  initialDirection?: DebtDirection
}

export function DebtForm({ open, onClose, initialDirection = 'receivable' }: Props) {
  const { t } = useT()
  return (
    <Modal open={open} onClose={onClose} title={t('dform.new')}>
      {open && <DebtFormBody onClose={onClose} initialDirection={initialDirection} />}
    </Modal>
  )
}

function DebtFormBody({
  onClose,
  initialDirection,
}: {
  onClose: () => void
  initialDirection: DebtDirection
}) {
  const { t } = useT()
  const { profile } = useAuth()
  const currency = profile?.base_currency ?? 'IDR'
  const symbol = getCurrency(currency).symbol

  const { data: contacts = [] } = useContacts()
  const createContact = useCreateContact()
  const createDebt = useCreateDebt()

  const [direction, setDirection] = useState<DebtDirection>(initialDirection)
  const [contactId, setContactId] = useState('') // '' = add a new person
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pending = createContact.isPending || createDebt.isPending
  const whoLabel = direction === 'receivable' ? t('dform.customer') : t('dform.supplier')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amountMinor = amountToMinor(amount, currency)
    if (amountMinor <= 0) return setError(t('dform.errAmount'))
    if (!contactId && !newName.trim()) return setError(t('dform.errWho'))

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
      setError(err instanceof Error ? err.message : t('acc.form.errGeneric'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label={t('dform.type')}>
        <Segmented
          value={direction}
          onChange={(v) => {
            setDirection(v)
            setContactId('')
          }}
          options={[
            { value: 'receivable', label: t('debt.filterRcv') },
            { value: 'payable', label: t('debt.filterPay') },
          ]}
          aria-label={t('dform.type')}
        />
      </Field>

      <Field label={whoLabel}>
        <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">{t('dform.addNew')}</option>
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
          <Field label={t('common.name')}>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('dform.namePh')}
              autoFocus
            />
          </Field>
          <Field label={t('dform.phone')}>
            <Input
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="08…"
            />
          </Field>
        </div>
      )}

      <Field label={t('dform.amount')}>
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
        <Field label={t('dform.due')}>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label={t('dform.note')}>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('dform.notePh')}
          />
        </Field>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" className="flex-1" loading={pending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}
