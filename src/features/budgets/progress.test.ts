import { describe, it, expect } from 'vitest'
import { periodBounds, previousPeriodBounds, spentInPeriod, budgetStatus } from './progress'
import type { Transaction, TransactionSplit } from '@/types/db'

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx',
    user_id: 'u1',
    account_id: 'a1',
    category_id: 'food',
    counter_account_id: null,
    type: 'expense',
    amount: 5000,
    currency: 'USD',
    base_amount: 5000,
    fx_rate: 1,
    counter_amount: null,
    counter_fx_rate: null,
    occurred_at: '2024-03-15T12:00:00Z',
    note: null,
    payee: null,
    source: 'web',
    status: 'pending',
    linked_transaction_id: null,
    external_ref: null,
    created_at: '2024-03-15T12:00:00Z',
    ...overrides,
  }
}

describe('periodBounds', () => {
  it('spans the calendar month containing ref', () => {
    const { start, end } = periodBounds('monthly', new Date('2024-03-15T12:00:00'))
    expect(start.getFullYear()).toBe(2024)
    expect(start.getMonth()).toBe(2) // March (0-based)
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(2)
    expect(end.getDate()).toBe(31)
  })

  it('uses Monday-based weeks', () => {
    // 2024-03-13 is a Wednesday -> week runs Mon 11th .. Sun 17th
    const { start, end } = periodBounds('weekly', new Date('2024-03-13T12:00:00'))
    expect(start.getDate()).toBe(11)
    expect(start.getDay()).toBe(1) // Monday
    expect(end.getDate()).toBe(17)
  })

  it('spans the calendar year', () => {
    const { start, end } = periodBounds('yearly', new Date('2024-06-15T12:00:00'))
    expect(start.getMonth()).toBe(0)
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(11)
    expect(end.getDate()).toBe(31)
  })
})

describe('previousPeriodBounds', () => {
  it('returns the month before the ref month', () => {
    const { start, end } = previousPeriodBounds('monthly', new Date('2024-03-15T12:00:00'))
    expect(start.getMonth()).toBe(1) // February
    expect(end.getMonth()).toBe(1)
    expect(end.getDate()).toBe(29) // 2024 is a leap year
  })
})

describe('spentInPeriod', () => {
  const bounds = periodBounds('monthly', new Date('2024-03-15T12:00:00'))

  it('sums matching-category expenses inside the window', () => {
    const txns = [
      tx({ id: '1', category_id: 'food', amount: 3000 }),
      tx({ id: '2', category_id: 'food', amount: 2000 }),
      tx({ id: '3', category_id: 'rent', amount: 9000 }), // wrong category
    ]
    expect(spentInPeriod(txns, new Set(['food']), bounds, 'USD')).toBe(5000)
  })

  it('counts every expense for an overall budget (null match set)', () => {
    const txns = [
      tx({ id: '1', category_id: 'food', amount: 3000 }),
      tx({ id: '2', category_id: 'rent', amount: 9000 }),
    ]
    expect(spentInPeriod(txns, null, bounds, 'USD')).toBe(12000)
  })

  it('excludes income, other currencies and out-of-window dates', () => {
    const txns = [
      tx({ id: '1', type: 'income', amount: 3000 }),
      tx({ id: '2', currency: 'EUR', amount: 3000 }),
      tx({ id: '3', occurred_at: '2024-02-15T12:00:00Z', amount: 3000 }),
    ]
    expect(spentInPeriod(txns, new Set(['food']), bounds, 'USD')).toBe(0)
  })

  it('counts only the matching parts of a split transaction', () => {
    const splits: Record<string, TransactionSplit[]> = {
      's1': [
        { id: 'a', transaction_id: 's1', user_id: 'u1', category_id: 'food', amount: 4000, note: null, created_at: '' },
        { id: 'b', transaction_id: 's1', user_id: 'u1', category_id: 'home', amount: 6000, note: null, created_at: '' },
      ],
    }
    const txns = [tx({ id: 's1', category_id: null, amount: 10000 })]
    expect(spentInPeriod(txns, new Set(['food']), bounds, 'USD', splits)).toBe(4000)
  })
})

describe('budgetStatus', () => {
  const bounds = periodBounds('monthly', new Date('2024-03-15T12:00:00'))

  it('classifies ok / near / over by percentage', () => {
    expect(budgetStatus(100000, 50000, bounds).level).toBe('ok')
    expect(budgetStatus(100000, 80000, bounds).level).toBe('near') // 80%
    expect(budgetStatus(100000, 100000, bounds).level).toBe('over') // 100%
  })

  it('adds rollover carry into the effective limit', () => {
    const s = budgetStatus(100000, 90000, bounds, 30000)
    expect(s.limit).toBe(130000)
    expect(s.remaining).toBe(40000)
    expect(s.level).toBe('ok') // 90k / 130k ≈ 69%
  })

  it('treats any spend against a zero limit as fully used', () => {
    expect(budgetStatus(0, 500, bounds).pct).toBe(100)
    expect(budgetStatus(0, 0, bounds).pct).toBe(0)
  })

  it('projects end-of-period spend linearly from elapsed time', () => {
    // ref exactly halfway through March -> double the spend so far
    const ref = new Date(bounds.start.getTime() + (bounds.end.getTime() - bounds.start.getTime()) / 2)
    expect(budgetStatus(100000, 20000, bounds, 0, ref).projected).toBe(40000)
  })
})
