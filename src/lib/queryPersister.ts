import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query'

const DB_NAME = 'tracr_offline_db'
const DB_VERSION = 2
const STORE_NAME = 'query_cache'
const CACHE_KEY = 'query_cache_v1'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'))
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
      if (!db.objectStoreNames.contains('offline_queue')) {
        db.createObjectStore('offline_queue')
      }
      if (!db.objectStoreNames.contains('failed_queue')) {
        db.createObjectStore('failed_queue')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function persistQueryCache(queryClient: QueryClient): Promise<void> {
  try {
    const db = await openDB()
    const dehydrated = dehydrate(queryClient, {
      shouldDehydrateQuery: (query) => {
        // Persist successful queries that aren't empty
        return query.state.status === 'success'
      },
    })
    const payload = JSON.stringify({
      timestamp: Date.now(),
      cache: dehydrated,
    })

    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(payload, CACHE_KEY)
  } catch {
    // Silent fallback if IndexedDB fails / restricted
  }
}

export async function restoreQueryCache(queryClient: QueryClient): Promise<boolean> {
  try {
    const db = await openDB()
    const rawPayload: string | null = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(CACHE_KEY)
      request.onsuccess = () => resolve((request.result as string) || null)
      request.onerror = () => resolve(null)
    })

    if (!rawPayload) return false
    const parsed = JSON.parse(rawPayload)
    if (!parsed || !parsed.cache || !parsed.timestamp) return false

    // Check expiration (7 days max)
    if (Date.now() - parsed.timestamp > MAX_AGE_MS) return false

    hydrate(queryClient, parsed.cache)
    return true
  } catch {
    return false
  }
}

/** Set up subscription to auto-persist query updates to IndexedDB. */
export function setupQueryCachePersister(queryClient: QueryClient): () => void {
  if (typeof window === 'undefined') return () => {}

  // Attempt initial restoration
  restoreQueryCache(queryClient)

  let timer: ReturnType<typeof setTimeout> | null = null

  // Debounced save on cache mutation
  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      persistQueryCache(queryClient)
    }, 1000)
  })

  return () => {
    if (timer) clearTimeout(timer)
    unsubscribe()
  }
}
