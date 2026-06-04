import { useCallback, useEffect, useState } from 'react'
import { defaultFilter, type TxFilter } from './filters'

export interface SavedView {
  id: string
  name: string
  filter: TxFilter
}

const KEY = 'tracr.savedViews.v1'

function load(): SavedView[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedView[]
    // Merge against defaults so views saved by older versions keep working.
    return parsed.map((v) => ({ ...v, filter: { ...defaultFilter, ...v.filter } }))
  } catch {
    return []
  }
}

/**
 * Saved "smart views" persisted in localStorage. Client-side first per the
 * roadmap — a `saved_views` table can replace this later without UI changes.
 */
export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>(() => load())

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(views))
    } catch {
      // Storage unavailable (private mode / quota) — views just won't persist.
    }
  }, [views])

  const save = useCallback((name: string, filter: TxFilter) => {
    const view: SavedView = { id: crypto.randomUUID(), name: name.trim(), filter }
    setViews((cur) => [...cur, view])
    return view
  }, [])

  const remove = useCallback((id: string) => {
    setViews((cur) => cur.filter((v) => v.id !== id))
  }, [])

  return { views, save, remove }
}
