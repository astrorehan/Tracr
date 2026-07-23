import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  Wallet,
  Store,
  Plus,
  Pencil,
  Copy,
  Archive,
  ArchiveRestore,
  Trash2,
  Check,
  MoreVertical,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { PageHeader, Pill, Section, ListCard, IconChip } from '@/components/ui/list'
import { CenterSpinner } from '@/components/ui/States'
import { useT } from '@/features/settings/language-context'
import { dateLocale } from '@/i18n'
import { useActiveBook } from '@/features/books/useActiveBook'
import { useUpdateBook, useDeleteBook, useDuplicateBookStructure } from '@/features/books/api'
import { BookForm } from '@/features/books/BookForm'
import type { Book } from '@/types/db'

/** Active accounts per book, in one round-trip, for the per-row stat. */
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
  const { t } = useT()
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
    <div className="mx-auto w-full max-w-2xl space-y-6 pb-20">
      <PageHeader
        title={t('books.title')}
        subtitle={t('books.subtitle')}
        action={
          <Pill variant="tint" icon={Plus} onClick={() => setCreating(true)}>
            {t('books.new')}
          </Pill>
        }
      />

      <ListCard className="rounded-[24px]">
        {active.map((book) => (
          <BookRow
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
          className="flex w-full items-center gap-3 py-4 text-left transition-opacity hover:opacity-90"
        >
          <IconChip icon={Plus} color="primary" />
          <span className="text-sm font-bold text-primary">{t('books.create')}</span>
        </button>
      </ListCard>

      {archived.length > 0 && (
        <Section title={t('books.archived')}>
          <ListCard className="rounded-[24px]">
            {archived.map((book) => (
              <BookRow
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
          </ListCard>
        </Section>
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

function BookRow({
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
  const { t } = useT()
  const update = useUpdateBook()
  const duplicate = useDuplicateBookStructure()
  const { setActiveBook, books } = useActiveBook()
  const color = book.color ?? '#0072BC'
  const isBusiness = book.type === 'business'

  function toggleArchive() {
    // Don't leave the user "inside" a book they just archived — hop to another.
    if (!book.is_archived && isActive) {
      const next = books.find((b) => b.id !== book.id && !b.is_archived)
      if (next) setActiveBook(next.id)
    }
    update.mutate({ id: book.id, patch: { is_archived: !book.is_archived } })
  }

  const typeLabel = t(isBusiness ? 'books.type.business' : 'books.type.personal')
  const accountLabel =
    accountCount === 1 ? t('books.oneAccount') : t('books.nAccounts', { count: accountCount })
  const openedLabel = book.last_opened_at
    ? t('books.openedAgo', {
        ago: formatDistanceToNow(new Date(book.last_opened_at), {
          addSuffix: true,
          locale: dateLocale(),
        }),
      })
    : null
  const subtitle = [typeLabel, accountLabel, openedLabel].filter(Boolean).join(' · ')

  return (
    <div className="flex items-center gap-3 py-3">
      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity hover:opacity-90"
      >
        <IconChip icon={isBusiness ? Store : Wallet} color={color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold text-foreground">{book.name}</p>
            {isActive && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
                <Check className="h-3 w-3" /> {t('books.active')}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">{subtitle}</p>
        </div>
      </button>

      <RowMenu
        book={book}
        canDelete={canDelete}
        busy={update.isPending || duplicate.isPending}
        onRename={onRename}
        onDuplicate={() => duplicate.mutate({ sourceId: book.id, name: `${book.name} copy` })}
        onToggleArchive={toggleArchive}
        onDelete={onDelete}
      />
    </div>
  )
}

/** Per-row overflow menu (⋯): rename, duplicate, archive, delete — kept off the
 *  main row so a tap anywhere else just opens the book. */
function RowMenu({
  book,
  canDelete,
  busy,
  onRename,
  onDuplicate,
  onToggleArchive,
  onDelete,
}: {
  book: Book
  canDelete: boolean
  busy: boolean
  onRename: () => void
  onDuplicate: () => void
  onToggleArchive: () => void
  onDelete: () => void
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function run(fn: () => void) {
    setOpen(false)
    fn()
  }

  const items = [
    { icon: Pencil, label: t('books.rename'), onClick: () => run(onRename) },
    { icon: Copy, label: t('books.duplicate'), onClick: () => run(onDuplicate) },
    {
      icon: book.is_archived ? ArchiveRestore : Archive,
      label: t(book.is_archived ? 'books.unarchive' : 'books.archive'),
      onClick: () => run(onToggleArchive),
    },
  ]

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label={t('books.more')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
      >
        <MoreVertical className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div
          role="menu"
          className="card-surface absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-lg animate-fade-in"
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={item.onClick}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
            >
              <item.icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              {item.label}
            </button>
          ))}

          <div className="my-1 h-px bg-border" />

          <button
            role="menuitem"
            onClick={() => run(onDelete)}
            disabled={!canDelete}
            title={canDelete ? undefined : t('books.needOne')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Trash2 className="h-[18px] w-[18px] shrink-0" />
            {t('books.delete')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Permanent delete behind a typed confirmation (the book name), like account deletion. */
function DeleteBookModal({ book, onClose }: { book: Book | null; onClose: () => void }) {
  const { t } = useT()
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
    <Modal open={Boolean(book)} onClose={close} title={t('books.deleteTitle')}>
      {book && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('books.deleteBody', { name: book.name })}
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              {t('books.deleteConfirm', { name: book.name })}
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
              {t('common.cancel')}
            </Button>
            <Button
              className="flex-1 bg-danger text-white hover:brightness-110"
              loading={del.isPending}
              disabled={!matches}
              onClick={confirm}
            >
              {t('books.deleteForever')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
