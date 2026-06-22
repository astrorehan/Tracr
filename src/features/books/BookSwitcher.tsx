import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Book as BookIcon, Check, ChevronsUpDown, Plus, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActiveBook } from './useActiveBook'
import { BookForm } from './BookForm'

/** Sidebar header control: shows the open book and a dropdown to switch books. */
export function BookSwitcher() {
  const { books, activeBook, activeBookId, setActiveBook } = useActiveBook()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const visible = books.filter((b) => !b.is_archived)
  const accent = activeBook?.color ?? 'var(--primary)'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="nav-rail group flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-muted/50 px-2.5 py-2 text-left transition-colors hover:bg-surface-muted"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          <BookIcon className="h-4 w-4" />
        </span>
        <span className="hidden min-w-0 flex-1 lg:block">
          <span className="block truncate text-sm font-bold text-foreground">
            {activeBook?.name ?? 'Books'}
          </span>
          <span className="block text-[11px] font-medium text-muted-foreground">Book</span>
        </span>
        <ChevronsUpDown className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 min-w-[220px] overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-lg lg:left-0 lg:right-auto lg:w-[228px]">
          <p className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Your books
          </p>
          <div className="max-h-64 overflow-y-auto">
            {visible.map((book) => {
              const isActive = book.id === activeBookId
              const c = book.color ?? 'var(--primary)'
              return (
                <button
                  key={book.id}
                  onClick={() => {
                    setActiveBook(book.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition-colors hover:bg-surface-muted',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: `${c}1f`, color: c }}
                  >
                    <BookIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{book.name}</span>
                  {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>

          <div className="my-1 h-px bg-border" />

          <button
            onClick={() => {
              setOpen(false)
              setCreating(true)
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <Plus className="h-4 w-4 shrink-0" /> New book
          </button>
          <button
            onClick={() => {
              setOpen(false)
              navigate('/books')
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <Settings2 className="h-4 w-4 shrink-0" /> Manage books
          </button>
        </div>
      )}

      <BookForm
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => setActiveBook(id)}
      />
    </div>
  )
}
