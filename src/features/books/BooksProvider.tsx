import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  const [activeBookId, setActiveBookId] = useState<string | null>(
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

  // Reconcile the cached id against reality: localStorage is just a hint, the
  // profile is authoritative, and we always fall back to *some* real book so
  // the rest of the app never runs a query with a stale/missing book_id.
  useEffect(() => {
    if (!user || books.length === 0) return
    const exists = (id: string | null | undefined) => !!id && books.some((b) => b.id === id)
    let next = activeBookId
    if (!exists(next)) {
      next = exists(profile?.active_book_id) ? profile!.active_book_id! : books[0].id
    }
    if (next && next !== activeBookId) {
      setActiveBookId(next)
      localStorage.setItem(STORAGE_KEY, next)
    }
  }, [user, books, profile?.active_book_id, activeBookId])

  const setActiveBook = useCallback(
    (id: string) => {
      if (id === activeBookId) return
      // Update locally first for an instant switch; queries keyed on the book id
      // refetch automatically. Persistence is best-effort in the background.
      setActiveBookId(id)
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
