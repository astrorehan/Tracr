export type OfflineMutationType =
  | 'CREATE_TRANSACTION'
  | 'UPDATE_TRANSACTION'
  | 'DELETE_TRANSACTION'
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

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
}

/** Save updated failed array. */
export function saveFailedMutations(failed: QueuedMutation[]): void {
  inMemoryFailed = [...failed]
  void persistToStorage()
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
}

/** Clear all failed mutations. */
export function clearFailedMutations(): void {
  inMemoryFailed = []
  void persistToStorage()
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

/**
 * Sequential FIFO worker that processes queued offline mutations using a handler callback.
 * If a handler returns true, the item is removed from queue. If false/throws, retryCount increments.
 * Items reaching MAX_RETRIES are moved to inMemoryFailed queue.
 */
export async function processOfflineQueue(
  executor: (mutation: QueuedMutation) => Promise<boolean>,
): Promise<{ processed: number; failed: number }> {
  const queue = [...inMemoryQueue]
  if (queue.length === 0) return { processed: 0, failed: 0 }

  let processed = 0
  let failed = 0
  const remaining: QueuedMutation[] = []
  const newFailed: QueuedMutation[] = [...inMemoryFailed]

  for (const item of queue) {
    try {
      const ok = await executor(item)
      if (ok) {
        processed++
      } else {
        item.retryCount++
        if (item.retryCount < MAX_RETRIES) {
          remaining.push(item)
        } else {
          failed++
          newFailed.push({ ...item, lastError: 'Executor returned false' })
        }
      }
    } catch (err: any) {
      item.retryCount++
      const errMsg = err?.message || 'Unknown network/server error'
      if (item.retryCount < MAX_RETRIES) {
        remaining.push({ ...item, lastError: errMsg })
      } else {
        failed++
        newFailed.push({ ...item, lastError: errMsg })
      }
    }
  }

  saveFailedMutations(newFailed)
  saveOfflineQueue(remaining)
  return { processed, failed }
}
