import { useState } from 'react'
import { Store, Wallet, type LucideIcon } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { ACCOUNT_COLORS } from '@/features/accounts/meta'
import { useCreateBook, useUpdateBook } from './api'
import type { Book, BookType } from '@/types/db'

const BOOK_TYPES: { value: BookType; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'personal', label: 'Personal', hint: 'Everyday money — income, spending, budgets', icon: Wallet },
  { value: 'business', label: 'Business', hint: 'A shop or UMKM — sales, debts, profit', icon: Store },
]

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
  const [type, setType] = useState<BookType>(book?.type ?? 'personal')
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
        const created = await create.mutateAsync({ name: name.trim(), color, type })
        onCreated?.(created.id)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!editing && (
        <Field label="Type">
          <div className="grid grid-cols-2 gap-2">
            {BOOK_TYPES.map((t) => {
              const Icon = t.icon
              const selected = type === t.value
              return (
                <button
                  type="button"
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-xl border-2 p-3 text-left transition-colors',
                    selected
                      ? 'border-primary bg-primary-soft'
                      : 'border-border hover:border-primary/40 hover:bg-surface-muted',
                  )}
                  aria-pressed={selected}
                >
                  <Icon className={cn('h-5 w-5', selected ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-sm font-bold text-foreground">{t.label}</span>
                  <span className="text-[11px] font-medium leading-tight text-muted-foreground">
                    {t.hint}
                  </span>
                </button>
              )
            })}
          </div>
        </Field>
      )}

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
