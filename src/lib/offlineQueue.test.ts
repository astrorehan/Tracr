import { describe, it, expect, beforeEach } from 'vitest'
import {
  getOfflineQueue,
  saveOfflineQueue,
  enqueueOfflineMutation,
  dequeueOfflineMutation,
  clearOfflineQueue,
  processOfflineQueue,
  remapQueuedTempIds,
  getFailedMutations,
  clearFailedMutations,
  retryFailedMutation,
  type QueuedMutation,
} from './offlineQueue'

describe('offlineQueue', () => {
  beforeEach(() => {
    clearOfflineQueue()
    clearFailedMutations()
  })

  it('starts with an empty queue and empty failed queue', () => {
    expect(getOfflineQueue()).toEqual([])
    expect(getFailedMutations()).toEqual([])
  })

  it('enqueues mutations and persists them to storage', () => {
    const item = enqueueOfflineMutation('CREATE_TRANSACTION', { amount: 50000, note: 'Lunch' })
    expect(item.type).toBe('CREATE_TRANSACTION')
    expect(item.payload.amount).toBe(50000)

    const queue = getOfflineQueue()
    expect(queue.length).toBe(1)
    expect(queue[0].id).toBe(item.id)
  })

  it('enqueues account, goal, debt, recurring, and product mutations', () => {
    const accItem = enqueueOfflineMutation('CREATE_ACCOUNT', { name: 'Main Cash' })
    const goalItem = enqueueOfflineMutation('CREATE_GOAL', { name: 'Buy Laptop', target_amount: 15000000 })
    const debtItem = enqueueOfflineMutation('CREATE_DEBT', { amount: 500000, direction: 'i_owe' })
    const recItem = enqueueOfflineMutation('CREATE_RECURRING', { name: 'Netflix', amount: 186000 })
    const prodItem = enqueueOfflineMutation('CREATE_PRODUCT', { name: 'Es Kopi', price: 18000 })

    expect(accItem.type).toBe('CREATE_ACCOUNT')
    expect(goalItem.type).toBe('CREATE_GOAL')
    expect(debtItem.type).toBe('CREATE_DEBT')
    expect(recItem.type).toBe('CREATE_RECURRING')
    expect(prodItem.type).toBe('CREATE_PRODUCT')

    const queue = getOfflineQueue()
    expect(queue.length).toBe(5)
  })

  it('remaps temporary IDs in queued payloads when server returns real UUID', () => {
    enqueueOfflineMutation('UPDATE_TRANSACTION', { id: 'temp-tx-123', amount: 15000 })
    enqueueOfflineMutation('DELETE_TRANSACTION', { id: 'temp-tx-123' })

    remapQueuedTempIds('temp-tx-123', 'real-uuid-456')

    const queue = getOfflineQueue()
    expect(queue[0].payload.id).toBe('real-uuid-456')
    expect(queue[1].payload.id).toBe('real-uuid-456')
  })

  it('dequeues specific mutations by ID', () => {
    const item1 = enqueueOfflineMutation('CREATE_TRANSACTION', { id: 'tx-1' })
    const item2 = enqueueOfflineMutation('UPDATE_TRANSACTION', { id: 'tx-2' })

    expect(getOfflineQueue().length).toBe(2)

    dequeueOfflineMutation(item1.id)
    const queue = getOfflineQueue()
    expect(queue.length).toBe(1)
    expect(queue[0].id).toBe(item2.id)
  })

  it('clears all queued mutations', () => {
    enqueueOfflineMutation('CREATE_TRANSACTION', { id: 'tx-1' })
    enqueueOfflineMutation('DELETE_TRANSACTION', { id: 'tx-2' })
    expect(getOfflineQueue().length).toBe(2)

    clearOfflineQueue()
    expect(getOfflineQueue()).toEqual([])
  })

  it('processes mutations sequentially via executor', async () => {
    enqueueOfflineMutation('CREATE_TRANSACTION', { amount: 100 })
    enqueueOfflineMutation('CREATE_TRANSACTION', { amount: 200 })

    const processedPayloads: number[] = []

    const result = await processOfflineQueue(async (mut: QueuedMutation) => {
      processedPayloads.push(mut.payload.amount)
      return true
    })

    expect(result.processed).toBe(2)
    expect(result.failed).toBe(0)
    expect(processedPayloads).toEqual([100, 200])
    expect(getOfflineQueue()).toEqual([])
  })

  it('moves item to failed queue after reaching max retries', async () => {
    const item = enqueueOfflineMutation('CREATE_TRANSACTION', { amount: 100 })
    saveOfflineQueue([{ ...item, retryCount: 2 }])

    const result = await processOfflineQueue(async () => {
      throw new Error('Network error')
    })

    expect(result.processed).toBe(0)
    expect(result.failed).toBe(1)
    expect(getOfflineQueue()).toEqual([])

    const failed = getFailedMutations()
    expect(failed.length).toBe(1)
    expect(failed[0].id).toBe(item.id)
    expect(failed[0].lastError).toBe('Network error')

    // Retry failed item back to active queue
    retryFailedMutation(item.id)
    expect(getFailedMutations()).toEqual([])
    expect(getOfflineQueue().length).toBe(1)
    expect(getOfflineQueue()[0].retryCount).toBe(0)
  })
})
