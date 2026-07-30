import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query'

const DB_NAME = 'tracr_offline_db'
const DB_VERSION = 2
const STORE_NAME = 'query_cache'
const CACHE_KEY = 'query_cache_v1'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const SAVE_DEBOUNCE_MS = 2000

// One connection per tab, reused. Opening a fresh handle on every write leaks
// connections and blocks any future version upgrade.
let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
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
  // A failed open must not poison every later call.
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
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

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(payload, CACHE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
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

export async function setupQueryCachePersister(queryClient: QueryClient): Promise<() => void> {
  if (typeof window === 'undefined') return () => {}

  // Await initial restoration so the app can block rendering on it
  await restoreQueryCache(queryClient)

  let timer: ReturnType<typeof setTimeout> | null = null
  let saving = false
  let dirty = false

  // Serializing the whole cache is O(cache size) on the main thread, so it runs
  // debounced, never concurrently, and only for events that changed cached data.
  // Without the `updated`/`removed` filter every fetch start and observer
  // add/remove would schedule another full dehydrate.
  const flush = () => {
    timer = null
    if (saving) {
      dirty = true
      return
    }
    saving = true
    void persistQueryCache(queryClient).finally(() => {
      saving = false
      if (dirty) {
        dirty = false
        schedule()
      }
    })
  }

  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, SAVE_DEBOUNCE_MS)
  }

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'added' || event.type === 'removed') return schedule()
    if (event.type !== 'updated') return // observer add/remove changes nothing on disk
    if (event.action.type === 'fetch') return // only flips fetchStatus
    schedule()
  })

  // A backgrounded PWA may never get another idle moment, so checkpoint on hide.
  const onHidden = () => {
    if (document.visibilityState === 'hidden') {
      if (timer) clearTimeout(timer)
      flush()
    }
  }
  document.addEventListener('visibilitychange', onHidden)

  return () => {
    if (timer) clearTimeout(timer)
    document.removeEventListener('visibilitychange', onHidden)
    unsubscribe()
  }
}

export async function clearQueryCache(queryClient?: QueryClient): Promise<void> {
  try {
    if (queryClient) {
      queryClient.clear()
    }
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(CACHE_KEY)
  } catch {
    // Silent fallback
  }
}
