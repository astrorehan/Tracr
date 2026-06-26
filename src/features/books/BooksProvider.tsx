import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Book } from '@/types/db'
import { useAuth } from '@/features/auth/useAuth'
import { BooksContext, type BooksState } from './context'

const STORAGE_KEY = 'active-book-id'

/**
 * Owns the active-book state: which ledger the user currently has open.
 *
 * Source of truth across devices is `profiles.active_book_id`; we mirror it to
 * localStorage so a returning user boots straight into their last book without
 * waiting on a round-trip. Lives inside AuthProvider so it sees the profile.
 */
export function BooksProvider({ children }: { children: ReactNode }) {
  const { user, profile, refreshProfile } = useAuth()
  const qc = useQueryClient()
  // The user's explicit pick (from localStorage on boot). It's only a hint —
  // the effective active book is derived below and always resolves to a real
  // book, so the rest of the app never queries with a stale/missing book_id.
  const [selectedBookId, setSelectedBookId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  )

  const { data: books = [], isLoading } = useQuery({
    queryKey: qk.books,
    enabled: !!user,
    queryFn: async (): Promise<Book[]> => {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .order('last_opened_at', { ascending: false, nullsFirst: false })
        .order('created_at')
      if (error) throw error
      return data as Book[]
    },
  })

  // Resolve the active book during render: explicit pick → profile (the
  // cross-device source of truth) → first book. Null only while books load.
  const profileBookId = profile?.active_book_id ?? null
  const activeBookId = useMemo(() => {
    if (books.length === 0) return null
    const exists = (id: string | null) => !!id && books.some((b) => b.id === id)
    if (exists(selectedBookId)) return selectedBookId
    if (exists(profileBookId)) return profileBookId
    return books[0].id
  }, [books, selectedBookId, profileBookId])

  const setActiveBook = useCallback(
    (id: string) => {
      if (id === activeBookId) return
      // Update locally first for an instant switch; queries keyed on the book id
      // refetch automatically. Persistence is best-effort in the background.
      setSelectedBookId(id)
      localStorage.setItem(STORAGE_KEY, id)
      void (async () => {
        if (user) {
          await supabase.from('profiles').update({ active_book_id: id }).eq('id', user.id)
        }
        await supabase
          .from('books')
          .update({ last_opened_at: new Date().toISOString() })
          .eq('id', id)
        void qc.invalidateQueries({ queryKey: qk.books })
        void refreshProfile()
      })()
    },
    [activeBookId, user, qc, refreshProfile],
  )

  const value = useMemo<BooksState>(
    () => ({
      books,
      activeBookId,
      activeBook: books.find((b) => b.id === activeBookId) ?? null,
      loading: isLoading,
      setActiveBook,
    }),
    [books, activeBookId, isLoading, setActiveBook],
  )

  return <BooksContext.Provider value={value}>{children}</BooksContext.Provider>
}
