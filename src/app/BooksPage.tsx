import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Book as BookIcon, Store, Plus, Pencil, Copy, Archive, ArchiveRestore, Trash2, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { PageHeader, Pill } from '@/components/ui/list'
import { CenterSpinner } from '@/components/ui/States'
import { cn } from '@/lib/utils'
import { useActiveBook } from '@/features/books/useActiveBook'
import {
  useUpdateBook,
  useDeleteBook,
  useDuplicateBookStructure,
} from '@/features/books/api'
import { BookForm } from '@/features/books/BookForm'
import type { Book } from '@/types/db'

/** Active accounts per book, in one round-trip, for the per-card stat. */
function useAccountCounts() {
  return useQuery({
    queryKey: ['book-account-counts'],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('accounts')
        .select('book_id')
        .eq('is_archived', false)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of (data ?? []) as { book_id: string }[]) {
        counts[row.book_id] = (counts[row.book_id] ?? 0) + 1
      }
      return counts
    },
  })
}

export function BooksPage() {
  const { books, activeBookId, setActiveBook, loading } = useActiveBook()
  const { data: counts = {} } = useAccountCounts()
  const navigate = useNavigate()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Book | null>(null)
  const [deleting, setDeleting] = useState<Book | null>(null)

  const { active, archived } = useMemo(
    () => ({
      active: books.filter((b) => !b.is_archived),
      archived: books.filter((b) => b.is_archived),
    }),
    [books],
  )

  function open(id: string) {
    setActiveBook(id)
    navigate('/')
  }

  if (loading) return <CenterSpinner />

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Books"
        subtitle="Each book is its own separate set of accounts, transactions and budgets. Switch anytime — nothing is shared across books."
        action={
          <Pill variant="tint" icon={Plus} onClick={() => setCreating(true)}>
            New book
          </Pill>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            accountCount={counts[book.id] ?? 0}
            isActive={book.id === activeBookId}
            canDelete={active.length > 1}
            onOpen={() => open(book.id)}
            onRename={() => setEditing(book)}
            onDelete={() => setDeleting(book)}
          />
        ))}

        <button
          onClick={() => setCreating(true)}
          className="flex min-h-[148px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:bg-surface-muted hover:text-foreground"
        >
          <Plus className="h-6 w-6" />
          <span className="text-sm font-semibold">New book</span>
        </button>
      </div>

      {archived.length > 0 && (
        <div className="space-y-3">
          <h2 className="section-head px-1 text-[17px] text-foreground">Archived</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                accountCount={counts[book.id] ?? 0}
                isActive={book.id === activeBookId}
                canDelete
                onOpen={() => open(book.id)}
                onRename={() => setEditing(book)}
                onDelete={() => setDeleting(book)}
              />
            ))}
          </div>
        </div>
      )}

      <BookForm
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        book={editing}
      />
      <DeleteBookModal book={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}

function BookCard({
  book,
  accountCount,
  isActive,
  canDelete,
  onOpen,
  onRename,
  onDelete,
}: {
  book: Book
  accountCount: number
  isActive: boolean
  canDelete: boolean
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const update = useUpdateBook()
  const duplicate = useDuplicateBookStructure()
  const { setActiveBook, books } = useActiveBook()
  const accent = book.color ?? 'var(--primary)'
  const isBusiness = book.type === 'business'
  const busy = update.isPending || duplicate.isPending

  function toggleArchive() {
    // Don't leave the user "inside" a book they just archived — hop to another.
    if (!book.is_archived && isActive) {
      const next = books.find((b) => b.id !== book.id && !b.is_archived)
      if (next) setActiveBook(next.id)
    }
    update.mutate({ id: book.id, patch: { is_archived: !book.is_archived } })
  }

  return (
    <Card className={cn('flex flex-col gap-3 p-4', isActive && 'ring-2 ring-primary/40')}>
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          {isBusiness ? <Store className="h-5 w-5" /> : <BookIcon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold text-foreground">
            {book.name}
            {isBusiness && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                <Store className="h-2.5 w-2.5" /> Business
              </span>
            )}
            {isActive && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-primary-soft px-1.5 py-0.5 text-xs font-bold uppercase text-primary">
                <Check className="h-2.5 w-2.5" /> Open
              </span>
            )}
          </p>
          <p className="truncate text-xs font-semibold text-muted-foreground">
            {accountCount} {accountCount === 1 ? 'account' : 'accounts'}
            {book.last_opened_at &&
              ` · opened ${formatDistanceToNow(new Date(book.last_opened_at), { addSuffix: true })}`}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button size="sm" className="flex-1" onClick={onOpen} disabled={busy}>
          Open
        </Button>
        <button
          onClick={onRename}
          disabled={busy}
          className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
          aria-label={`Rename ${book.name}`}
          title="Rename"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => duplicate.mutate({ sourceId: book.id, name: `${book.name} copy` })}
          disabled={busy}
          className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
          aria-label={`Duplicate ${book.name}`}
          title="Duplicate setup (accounts, categories, budgets — no transactions)"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          onClick={toggleArchive}
          disabled={busy}
          className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
          aria-label={book.is_archived ? `Unarchive ${book.name}` : `Archive ${book.name}`}
          title={book.is_archived ? 'Unarchive' : 'Archive'}
        >
          {book.is_archived ? (
            <ArchiveRestore className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={onDelete}
          disabled={busy || !canDelete}
          className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-danger/10 hover:bg-danger/10 hover:text-danger disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          aria-label={`Delete ${book.name}`}
          title={canDelete ? 'Delete permanently' : 'You need at least one book'}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </Card>
  )
}

/** Permanent delete behind a typed confirmation (the book name), like account deletion. */
function DeleteBookModal({ book, onClose }: { book: Book | null; onClose: () => void }) {
  const del = useDeleteBook()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)

  function close() {
    if (del.isPending) return
    setTyped('')
    setError(null)
    onClose()
  }

  async function confirm() {
    if (!book) return
    setError(null)
    try {
      await del.mutateAsync(book.id)
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete this book.')
    }
  }

  const matches = book ? typed.trim() === book.name : false

  return (
    <Modal open={Boolean(book)} onClose={close} title="Delete book">
      {book && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            This permanently deletes <span className="font-bold text-foreground">{book.name}</span>{' '}
            and everything in it — accounts, transactions, budgets, bills, goals and receipts. This
            cannot be undone.
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Type <span className="font-bold text-danger">{book.name}</span> to confirm
            </label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={book.name}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={close} disabled={del.isPending}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-danger text-white hover:brightness-110"
              loading={del.isPending}
              disabled={!matches}
              onClick={confirm}
            >
              Delete forever
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
