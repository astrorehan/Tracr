import { describe, it, expect } from 'vitest'
import {
  periodTotals,
  totalsInBase,
  pctChange,
  pickGranularity,
  bucketByTime,
  categoryBreakdown,
  categoryTree,
  payeeBreakdown,
  dailyTotals,
  topCategoryId,
} from './reports'
import type { Category, FxRate, Transaction } from '@/types/db'

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: 'u1',
    account_id: 'a1',
    category_id: null,
    counter_account_id: null,
    type: 'expense',
    amount: 1000,
    currency: 'USD',
    base_amount: null,
    fx_rate: null,
    counter_amount: null,
    counter_fx_rate: null,
    occurred_at: '2024-03-15T12:00:00',
    note: null,
    payee: null,
    source: 'web',
    status: 'pending',
    linked_transaction_id: null,
    external_ref: null,
    created_at: '2024-03-15T12:00:00',
    ...overrides,
  }
}

function cat(id: string, name: string, parent_id: string | null = null): Category {
  return {
    id,
    user_id: 'u1',
    name,
    kind: 'expense',
    parent_id,
    icon: null,
    color: '#fff',
    is_archived: false,
    sort_order: 0,
    created_at: '',
  }
}

function fx(base: string, quote: string, rate: number): FxRate {
  return { id: `${base}${quote}`, user_id: 'u1', base, quote, rate, as_of: '2024-01-01', source: 'manual', created_at: '' }
}

describe('periodTotals', () => {
  it('sums income, expense and net, ignoring transfers in the net', () => {
    const t = periodTotals([
      tx({ type: 'income', amount: 5000 }),
      tx({ type: 'expense', amount: 2000 }),
      tx({ type: 'transfer', amount: 9999 }),
    ])
    expect(t).toEqual({ income: 5000, expense: 2000, net: 3000, count: 3 })
  })
})

describe('totalsInBase', () => {
  it('values rows by snapshot or latest rate and skips transfers + unvaluable rows', () => {
    const rates = [fx('USD', 'EUR', 2)] // 1 USD = 2 EUR -> EUR->USD = 0.5
    const txns = [
      tx({ type: 'income', base_amount: 5000 }),
      tx({ type: 'expense', base_amount: 2000 }),
      tx({ type: 'transfer', base_amount: 9999 }), // skipped
      tx({ type: 'income', base_amount: null, currency: 'EUR', amount: 200 }), // 2.00 EUR -> 1.00 USD
      tx({ type: 'expense', base_amount: null, currency: 'JPY', amount: 500 }), // no rate -> skipped
    ]
    expect(totalsInBase(txns, 'USD', rates)).toEqual({ income: 5100, expense: 2000, net: 3100, count: 3 })
  })
})

describe('pctChange', () => {
  it('computes signed percentage relative to the baseline magnitude', () => {
    expect(pctChange(150, 100)).toBe(50)
    expect(pctChange(50, 100)).toBe(-50)
    expect(pctChange(0, 0)).toBe(0)
    expect(pctChange(5, 0)).toBeNull() // no baseline
  })
})

describe('pickGranularity', () => {
  it('uses daily buckets up to ~2 months, monthly beyond', () => {
    const from = new Date('2024-01-01')
    expect(pickGranularity(from, new Date('2024-01-31'))).toBe('day')
    expect(pickGranularity(from, new Date('2024-05-01'))).toBe('month')
  })
})

describe('bucketByTime', () => {
  it('seeds empty buckets and drops out-of-range transactions', () => {
    const from = new Date('2024-03-01T00:00:00')
    const to = new Date('2024-03-03T23:59:59')
    const buckets = bucketByTime(
      [
        tx({ type: 'income', amount: 100, occurred_at: '2024-03-01T12:00:00' }),
        tx({ type: 'expense', amount: 40, occurred_at: '2024-03-02T12:00:00' }),
        tx({ type: 'expense', amount: 999, occurred_at: '2024-03-09T12:00:00' }), // outside
      ],
      from,
      to,
      'day',
    )
    expect(buckets).toHaveLength(3)
    expect(buckets[0]).toMatchObject({ income: 100, expense: 0, net: 100 })
    expect(buckets[1]).toMatchObject({ income: 0, expense: 40, net: -40 })
    expect(buckets[2]).toMatchObject({ income: 0, expense: 0, net: 0 })
  })
})

describe('categoryBreakdown', () => {
  const cats = [cat('food', 'Food'), cat('dineout', 'Dining', 'food'), cat('rent', 'Rent')]

  it('ranks categories by spend and surfaces uncategorized', () => {
    const slices = categoryBreakdown(
      [
        tx({ category_id: 'rent', amount: 5000 }),
        tx({ category_id: 'dineout', amount: 3000 }),
        tx({ category_id: null, amount: 1000 }), // uncategorized
        tx({ type: 'income', category_id: 'rent', amount: 9999 }), // wrong kind, ignored
      ],
      cats,
      'expense',
    )
    expect(slices.map((s) => [s.id, s.total])).toEqual([
      ['rent', 5000],
      ['dineout', 3000],
      ['__uncat', 1000],
    ])
    expect(slices[0].pct).toBeCloseTo((5000 / 9000) * 100, 6)
  })
})

describe('categoryTree', () => {
  const cats = [cat('food', 'Food'), cat('dineout', 'Dining', 'food'), cat('rent', 'Rent')]

  it('rolls children up to parents and marks drillable nodes', () => {
    const nodes = categoryTree(
      [
        tx({ category_id: 'dineout', amount: 3000 }), // under Food
        tx({ category_id: 'food', amount: 1000 }), // booked directly on Food
        tx({ category_id: 'rent', amount: 5000 }), // top-level only
      ],
      cats,
      'expense',
    )
    const rent = nodes.find((n) => n.id === 'rent')!
    const food = nodes.find((n) => n.id === 'food')!
    expect(rent.total).toBe(5000)
    expect(rent.children).toHaveLength(0) // not drillable (single direct child)
    expect(food.total).toBe(4000)
    expect(food.children.map((c) => [c.id, c.total])).toEqual([
      ['dineout', 3000],
      ['__direct', 1000],
    ])
  })
})

describe('payeeBreakdown', () => {
  it('groups by trimmed payee and drops blank ones', () => {
    const slices = payeeBreakdown(
      [
        tx({ amount: 2000, payee: 'Cafe' }),
        tx({ amount: 1000, payee: 'Cafe' }),
        tx({ amount: 4000, payee: 'Rent Co' }),
        tx({ amount: 999, payee: '   ' }), // dropped
      ],
      'expense',
    )
    expect(slices.map((s) => [s.name, s.total, s.count])).toEqual([
      ['Rent Co', 4000, 1],
      ['Cafe', 3000, 2],
    ])
  })
})

describe('dailyTotals', () => {
  it('keys daily spend by yyyy-MM-dd', () => {
    const map = dailyTotals(
      [
        tx({ amount: 1000, occurred_at: '2024-03-01T08:00:00' }),
        tx({ amount: 500, occurred_at: '2024-03-01T20:00:00' }),
        tx({ type: 'income', amount: 9999, occurred_at: '2024-03-01T09:00:00' }), // wrong kind
      ],
      'expense',
    )
    expect(map.get('2024-03-01')).toBe(1500)
  })
})

describe('topCategoryId', () => {
  const catMap = new Map([
    ['food', cat('food', 'Food')],
    ['dineout', cat('dineout', 'Dining', 'food')],
  ])
  it('resolves a child to its parent and leaves top-level ids alone', () => {
    expect(topCategoryId('dineout', catMap)).toBe('food')
    expect(topCategoryId('food', catMap)).toBe('food')
    expect(topCategoryId(null, catMap)).toBeNull()
  })
})
