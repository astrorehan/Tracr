import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { ACCOUNT_COLORS } from '@/features/accounts/meta'
import { useCreateBook, useUpdateBook } from './api'
import type { Book } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  book?: Book | null
  /** Called with the new book's id after a successful create. */
  onCreated?: (id: string) => void
}

export function BookForm({ open, onClose, book, onCreated }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={book ? 'Rename book' : 'New book'}>
      {open && <BookFormBody onClose={onClose} book={book ?? null} onCreated={onCreated} />}
    </Modal>
  )
}

function BookFormBody({
  onClose,
  book,
  onCreated,
}: {
  onClose: () => void
  book: Book | null
  onCreated?: (id: string) => void
}) {
  const create = useCreateBook()
  const update = useUpdateBook()
  const editing = Boolean(book)

  const [name, setName] = useState(book?.name ?? '')
  const [color, setColor] = useState(book?.color ?? ACCOUNT_COLORS[0])
  const [error, setError] = useState<string | null>(null)

  const pending = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please name this book.')
      return
    }
    try {
      if (book) {
        await update.mutateAsync({ id: book.id, patch: { name: name.trim(), color } })
      } else {
        const created = await create.mutateAsync({ name: name.trim(), color })
        onCreated?.(created.id)
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
          placeholder="e.g. Personal, Business, Family"
          autoFocus
        />
      </Field>

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
