export type OfflineMutationType =
  | 'CREATE_TRANSACTION'
  | 'UPDATE_TRANSACTION'
  | 'DELETE_TRANSACTION'
  | 'SET_TRANSACTION_TAGS'
  | 'SET_TRANSACTION_SPLITS'
  | 'CREATE_ACCOUNT'
  | 'UPDATE_ACCOUNT'
  | 'DELETE_ACCOUNT'
  | 'CREATE_CATEGORY'
  | 'UPDATE_CATEGORY'
  | 'DELETE_CATEGORY'
  | 'CREATE_BUDGET'
  | 'UPDATE_BUDGET'
  | 'DELETE_BUDGET'
  | 'CREATE_GOAL'
  | 'UPDATE_GOAL'
  | 'DELETE_GOAL'
  | 'ADD_GOAL_CONTRIBUTION'
  | 'CREATE_GOAL_CONTRIBUTION'
  | 'DELETE_GOAL_CONTRIBUTION'
  | 'CREATE_CONTACT'
  | 'UPDATE_CONTACT'
  | 'DELETE_CONTACT'
  | 'CREATE_DEBT'
  | 'UPDATE_DEBT'
  | 'DELETE_DEBT'
  | 'ADD_DEBT_PAYMENT'
  | 'CREATE_DEBT_PAYMENT'
  | 'DELETE_DEBT_PAYMENT'
  | 'CREATE_RECURRING'
  | 'UPDATE_RECURRING'
  | 'DELETE_RECURRING'
  | 'CREATE_PRODUCT'
  | 'UPDATE_PRODUCT'
  | 'DELETE_PRODUCT'
  | 'CREATE_RULE'
  | 'UPDATE_RULE'
  | 'DELETE_RULE'
  | 'CREATE_INSTALLMENT'
  | 'UPDATE_INSTALLMENT'
  | 'DELETE_INSTALLMENT'
  | 'PAY_INSTALLMENT'
  | 'EARLY_PAYOFF_INSTALLMENT'

export interface QueuedMutation<T = Record<string, any>> {
  id: string
  type: OfflineMutationType
  payload: T
  createdAt: string
  retryCount: number
  lastError?: string
}

const DB_NAME = 'tracr_offline_db'
const DB_VERSION = 2
const QUEUE_STORE = 'offline_queue'
const FAILED_STORE = 'failed_queue'
const QUEUE_KEY = 'queue_data_v1'
const FAILED_KEY = 'failed_data_v1'
const LOCAL_STORAGE_KEY = 'tracr.offline_queue.v1'
const MAX_RETRIES = 3

// Synchronous memory cache for instant reads across components
let inMemoryQueue: QueuedMutation[] = []
let inMemoryFailed: QueuedMutation[] = []

const listeners = new Set<() => void>()

/**
 * Subscribe to queue changes. Lets the UI react to enqueue/drain events instead
 * of polling the in-memory arrays on a timer.
 */
export function subscribeOfflineQueue(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  for (const listener of listeners) listener()
}

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
      if (!db.objectStoreNames.contains('query_cache')) {
        db.createObjectStore('query_cache')
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE)
      }
      if (!db.objectStoreNames.contains(FAILED_STORE)) {
        db.createObjectStore(FAILED_STORE)
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

/** Async persister to IndexedDB with localStorage fallback */
async function persistToStorage(): Promise<void> {
  // Always update localStorage as immediate fallback
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(inMemoryQueue))
    } catch {
      // quota full
    }
  }

  try {
    const db = await openDB()
    const tx = db.transaction([QUEUE_STORE, FAILED_STORE], 'readwrite')
    tx.objectStore(QUEUE_STORE).put(JSON.stringify(inMemoryQueue), QUEUE_KEY)
    tx.objectStore(FAILED_STORE).put(JSON.stringify(inMemoryFailed), FAILED_KEY)
  } catch {
    // Silent IDB fallback
  }
}

/** Initial load from IndexedDB or localStorage */
export async function initOfflineStorage(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const db = await openDB()
    const rawQueue: string | null = await new Promise((resolve) => {
      const tx = db.transaction(QUEUE_STORE, 'readonly')
      const request = tx.objectStore(QUEUE_STORE).get(QUEUE_KEY)
      request.onsuccess = () => resolve((request.result as string) || null)
      request.onerror = () => resolve(null)
    })
    const rawFailed: string | null = await new Promise((resolve) => {
      const tx = db.transaction(FAILED_STORE, 'readonly')
      const request = tx.objectStore(FAILED_STORE).get(FAILED_KEY)
      request.onsuccess = () => resolve((request.result as string) || null)
      request.onerror = () => resolve(null)
    })

    if (rawQueue) {
      const parsed = JSON.parse(rawQueue)
      if (Array.isArray(parsed)) inMemoryQueue = parsed
    } else if (window.localStorage) {
      const lsRaw = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (lsRaw) {
        const parsed = JSON.parse(lsRaw)
        if (Array.isArray(parsed)) inMemoryQueue = parsed
      }
    }

    if (rawFailed) {
      const parsed = JSON.parse(rawFailed)
      if (Array.isArray(parsed)) inMemoryFailed = parsed
    }
  } catch {
    if (window.localStorage) {
      const lsRaw = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (lsRaw) {
        try {
          const parsed = JSON.parse(lsRaw)
          if (Array.isArray(parsed)) inMemoryQueue = parsed
        } catch {
          // ignore
        }
      }
    }
  }
  // The hook mounts before this async load finishes, so tell it to re-read.
  notify()
}

// Auto-trigger storage init on module import in browser
if (typeof window !== 'undefined') {
  void initOfflineStorage()
}

/** Safe getter for the offline queue. */
export function getOfflineQueue(): QueuedMutation[] {
  return inMemoryQueue
}

/** Safe getter for failed mutations. */
export function getFailedMutations(): QueuedMutation[] {
  return inMemoryFailed
}

/** Save updated queue array. */
export function saveOfflineQueue(queue: QueuedMutation[]): void {
  inMemoryQueue = [...queue]
  void persistToStorage()
  notify()
}

/** Save updated failed array. */
export function saveFailedMutations(failed: QueuedMutation[]): void {
  inMemoryFailed = [...failed]
  void persistToStorage()
  notify()
}

/** Add a new mutation payload to the offline FIFO queue. */
export function enqueueOfflineMutation<T = Record<string, any>>(
  type: OfflineMutationType,
  payload: T,
): QueuedMutation<T> {
  const item: QueuedMutation<T> = {
    id: `offline-mut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  }
  saveOfflineQueue([...inMemoryQueue, item as unknown as QueuedMutation])
  return item
}

/** Remove a processed mutation item by ID. */
export function dequeueOfflineMutation(id: string): void {
  saveOfflineQueue(inMemoryQueue.filter((item) => item.id !== id))
}

/** Clear all queued offline mutations. */
export function clearOfflineQueue(): void {
  inMemoryQueue = []
  void persistToStorage()
  notify()
}

/** Clear all failed mutations. */
export function clearFailedMutations(): void {
  inMemoryFailed = []
  void persistToStorage()
  notify()
}

/** Remove a failed mutation by ID. */
export function removeFailedMutation(id: string): void {
  saveFailedMutations(inMemoryFailed.filter((item) => item.id !== id))
}

/** Re-enqueue a failed mutation back to active offline queue. */
export function retryFailedMutation(id: string): void {
  const item = inMemoryFailed.find((m) => m.id === id)
  if (!item) return
  saveFailedMutations(inMemoryFailed.filter((m) => m.id !== id))
  saveOfflineQueue([...inMemoryQueue, { ...item, retryCount: 0, lastError: undefined }])
}

/**
 * Replace occurrences of a temporary ID (created offline) with the real server UUID in remaining queued mutations.
 */
export function remapQueuedTempIds(tempId: string, realId: string): void {
  if (!tempId || !realId || tempId === realId) return
  const updated = inMemoryQueue.map((item) => {
    let raw = JSON.stringify(item.payload)
    if (raw.includes(tempId)) {
      raw = raw.split(tempId).join(realId)
      try {
        return { ...item, payload: JSON.parse(raw) }
      } catch {
        return item
      }
    }
    return item
  })
  saveOfflineQueue(updated)
}

// Module-level lock. `isSyncing` state inside a hook is per-component-instance,
// so two mounted consumers (or an `online` event landing during a manual sync)
// could otherwise run the queue twice and double-write every mutation.
let isProcessing = false

/** True while processOfflineQueue is draining the queue. */
export function isProcessingOfflineQueue(): boolean {
  return isProcessing
}

/**
 * Sequential FIFO worker that processes queued offline mutations using a handler callback.
 * If a handler returns true, the item is removed from queue. If false/throws, retryCount increments.
 * Items reaching MAX_RETRIES are moved to inMemoryFailed queue.
 *
 * Each item is settled against the live queue immediately rather than in one
 * batch at the end. That matters for three reasons:
 *  - mutations enqueued while a sync is in flight must survive it;
 *  - `remapQueuedTempIds` rewrites later payloads mid-run, so each item has to
 *    be re-read from the live queue right before it executes;
 *  - a tab closed halfway through must not replay the items already accepted.
 */
export async function processOfflineQueue(
  executor: (mutation: QueuedMutation) => Promise<boolean>,
): Promise<{ processed: number; failed: number }> {
  if (isProcessing) return { processed: 0, failed: 0 }
  const ids = inMemoryQueue.map((item) => item.id)
  if (ids.length === 0) return { processed: 0, failed: 0 }

  isProcessing = true
  let processed = 0
  let failed = 0

  try {
    for (const id of ids) {
      const item = inMemoryQueue.find((m) => m.id === id)
      if (!item) continue // dequeued or cleared while we were awaiting

      let ok = false
      let errMsg: string | undefined
      try {
        ok = await executor(item)
        if (!ok) errMsg = 'Executor returned false'
      } catch (err: any) {
        errMsg = err?.message || 'Unknown network/server error'
      }

      // Re-read: the executor may have remapped this item's payload.
      const settled = inMemoryQueue.find((m) => m.id === id) ?? item

      if (ok) {
        processed++
        saveOfflineQueue(inMemoryQueue.filter((m) => m.id !== id))
        continue
      }

      const retryCount = settled.retryCount + 1
      if (retryCount < MAX_RETRIES) {
        saveOfflineQueue(
          inMemoryQueue.map((m) => (m.id === id ? { ...m, retryCount, lastError: errMsg } : m)),
        )
      } else {
        failed++
        saveFailedMutations([...inMemoryFailed, { ...settled, retryCount, lastError: errMsg }])
        saveOfflineQueue(inMemoryQueue.filter((m) => m.id !== id))
      }
    }
  } finally {
    isProcessing = false
  }

  return { processed, failed }
}
