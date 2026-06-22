import { createContext } from 'react'
import type { Book } from '@/types/db'

export interface BooksState {
  /** All non-archived books, plus archived ones when explicitly loaded. */
  books: Book[]
  /** The currently open book's id (always set once books have loaded). */
  activeBookId: string | null
  /** The currently open book row, or null while loading. */
  activeBook: Book | null
  /** True until the book list has resolved for the first time. */
  loading: boolean
  /** Switch the active book: persists to the profile + localStorage and refetches. */
  setActiveBook: (id: string) => void
}

export const BooksContext = createContext<BooksState | undefined>(undefined)
