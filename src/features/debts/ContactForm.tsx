import { useState } from 'react'
import { Archive, RotateCcw, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { useConfirm } from '@/components/ui/confirm-context'
import { useT } from '@/features/settings/language-context'
import { useActiveBook } from '@/features/books/useActiveBook'
import {
  useArchiveContact,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
  type ContactTally,
} from './api'
import type { Contact, ContactKind } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  /** Pass a contact to edit them; omit to add someone new. */
  contact?: Contact | null
  /** Their kasbon rollup — decides whether delete is safe to offer. */
  tally?: ContactTally
}

export function ContactForm({ open, onClose, contact, tally }: Props) {
  const { t } = useT()
  return (
    <Modal open={open} onClose={onClose} title={contact ? t('ct.formEdit') : t('ct.formNew')}>
      {open && <ContactFormBody onClose={onClose} contact={contact ?? null} tally={tally} />}
    </Modal>
  )
}

function ContactFormBody({
  onClose,
  contact,
  tally,
}: {
  onClose: () => void
  contact: Contact | null
  tally?: ContactTally
}) {
  const { t } = useT()
  const { activeBook } = useActiveBook()
  const isPersonal = activeBook?.type === 'personal'
  const confirm = useConfirm()

  const createContact = useCreateContact()
  const updateContact = useUpdateContact()
  const archiveContact = useArchiveContact()
  const deleteContact = useDeleteContact()

  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [kind, setKind] = useState<ContactKind>(contact?.kind ?? 'customer')
  const [note, setNote] = useState(contact?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const pending = createContact.isPending || updateContact.isPending
  // Deleting someone with history would strip their name off past kasbon rows
  // (debts.contact_id is ON DELETE SET NULL), so history means archive only.
  const hasHistory = (tally?.records ?? 0) > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError(t('ct.errName'))

    try {
      if (contact) {
        await updateContact.mutateAsync({
          id: contact.id,
          patch: {
            name: name.trim(),
            phone: phone.trim() || null,
            kind,
            note: note.trim() || null,
          },
        })
      } else {
        await createContact.mutateAsync({
          name: name.trim(),
          phone: phone.trim() || null,
          kind,
          note: note.trim() || null,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('acc.form.errGeneric'))
    }
  }

  async function handleArchive() {
    if (!contact) return
    if (contact.is_archived) {
      archiveContact.mutate({ id: contact.id, archived: false })
      onClose()
      return
    }
    if (
      await confirm({
        title: t('ct.hideTitle'),
        message: t('ct.hideMsg', { name: contact.name }),
        confirmLabel: t('ct.hide'),
        cancelLabel: t('common.cancel'),
      })
    ) {
      archiveContact.mutate({ id: contact.id, archived: true })
      onClose()
    }
  }

  async function handleDelete() {
    if (!contact) return
    if (
      await confirm({
        title: t('ct.deleteTitle'),
        message: t('ct.deleteMsg', { name: contact.name }),
        tone: 'danger',
        confirmLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
      })
    ) {
      deleteContact.mutate(contact.id)
      onClose()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label={t('common.name')}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('dform.namePh')}
          autoFocus
        />
      </Field>

      <Field label={t('dform.phone')}>
        <Input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="08…"
        />
      </Field>

      {!isPersonal && (
        <Field label={t('ct.kind')}>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'customer', label: t('ct.kindCustomer') },
              { value: 'supplier', label: t('ct.kindSupplier') },
              { value: 'both', label: t('ct.kindBoth') },
            ]}
            aria-label={t('ct.kind')}
          />
        </Field>
      )}

      <Field label={t('ct.note')}>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('ct.notePh')}
        />
      </Field>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" className="flex-1" loading={pending}>
          {t('common.save')}
        </Button>
      </div>

      {contact && (
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleArchive}
            className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {contact.is_archived ? (
              <>
                <RotateCcw className="h-4 w-4" />
                {t('ct.unhide')}
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" />
                {t('ct.hide')}
              </>
            )}
          </button>

          {hasHistory ? (
            <p className="text-center text-xs font-medium text-muted-foreground">
              {t('ct.keepHistory', { n: tally?.records ?? 0 })}
            </p>
          ) : (
            <button
              type="button"
              onClick={handleDelete}
              className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
              {t('ct.delete')}
            </button>
          )}
        </div>
      )}
    </form>
  )
}
