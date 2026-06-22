import { useContext } from 'react'
import { BooksContext } from './context'

export function useActiveBook() {
  const ctx = useContext(BooksContext)
  if (!ctx) throw new Error('useActiveBook must be used within a BooksProvider')
  return ctx
}
