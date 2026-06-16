import { describe, it, expect } from 'vitest'
import { categoryContributions } from './splits'
import type { Transaction, TransactionSplit } from '@/types/db'

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx1',
    user_id: 'u1',
    account_id: 'a1',
    category_id: 'cat-food',
    counter_account_id: null,
    type: 'expense',
    amount: 10000,
    currency: 'USD',
    base_amount: 10000,
    fx_rate: 1,
    counter_amount: null,
    counter_fx_rate: null,
    occurred_at: '2024-03-01T00:00:00Z',
    note: null,
    payee: null,
    source: 'web',
    status: 'pending',
    external_ref: null,
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function split(category_id: string | null, amount: number): TransactionSplit {
  return {
    id: `s-${category_id}-${amount}`,
    transaction_id: 'tx1',
    user_id: 'u1',
    category_id,
    amount,
    note: null,
    created_at: '2024-03-01T00:00:00Z',
  }
}

describe('categoryContributions', () => {
  it('returns one contribution for the txn category when there are no splits', () => {
    expect(categoryContributions(tx(), {})).toEqual([{ categoryId: 'cat-food', amount: 10000 }])
  })

  it('maps each split to its own contribution', () => {
    const splits = { tx1: [split('cat-food', 6000), split('cat-home', 4000)] }
    expect(categoryContributions(tx(), splits)).toEqual([
      { categoryId: 'cat-food', amount: 6000 },
      { categoryId: 'cat-home', amount: 4000 },
    ])
  })

  it('falls back to the whole txn when the splits list is empty', () => {
    expect(categoryContributions(tx(), { tx1: [] })).toEqual([
      { categoryId: 'cat-food', amount: 10000 },
    ])
  })

  it('preserves a null (uncategorized) category', () => {
    expect(categoryContributions(tx({ category_id: null }), {})).toEqual([
      { categoryId: null, amount: 10000 },
    ])
  })
})
