import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resolveDateRange,
  previousDateRange,
  activeFilterCount,
  isFilterEmpty,
  defaultFilter,
  type TxFilter,
} from './filters'

describe('resolveDateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-03-15T12:00:00')) // a Friday
  })
  afterEach(() => vi.useRealTimers())

  const range = (over: Partial<TxFilter>) =>
    resolveDateRange({ datePreset: 'all', customFrom: '', customTo: '', ...over })

  it('returns an open range for "all"', () => {
    expect(range({ datePreset: 'all' })).toEqual({})
  })

  it('bounds "today" to the current calendar day', () => {
    const r = range({ datePreset: 'today' })
    expect(new Date(r.from!).getDate()).toBe(15)
    expect(new Date(r.to!).getDate()).toBe(15)
  })

  it('spans the current and previous month', () => {
    const tm = range({ datePreset: 'this_month' })
    expect(new Date(tm.from!).getMonth()).toBe(2) // March
    expect(new Date(tm.from!).getDate()).toBe(1)
    expect(new Date(tm.to!).getDate()).toBe(31)

    const lm = range({ datePreset: 'last_month' })
    expect(new Date(lm.from!).getMonth()).toBe(1) // February
    expect(new Date(lm.from!).getDate()).toBe(1)
  })

  it('honors an explicit custom range', () => {
    const r = range({ datePreset: 'custom', customFrom: '2024-01-05', customTo: '2024-01-20' })
    expect(new Date(r.from!).getDate()).toBe(5)
    expect(new Date(r.to!).getMonth()).toBe(0)
    expect(new Date(r.to!).getDate()).toBe(20)
  })
})

describe('previousDateRange', () => {
  it('returns the equal-length window ending just before the range', () => {
    const from = '2024-03-01T00:00:00.000Z'
    const to = '2024-03-31T00:00:00.000Z'
    const dur = +new Date(to) - +new Date(from)
    const prev = previousDateRange({ from, to })
    expect(+new Date(prev.to!)).toBe(+new Date(from) - 1)
    expect(+new Date(prev.to!) - +new Date(prev.from!)).toBe(dur)
  })

  it('returns nothing for an open-ended range', () => {
    expect(previousDateRange({})).toEqual({})
    expect(previousDateRange({ from: '2024-03-01T00:00:00Z' })).toEqual({})
  })
})

describe('activeFilterCount / isFilterEmpty', () => {
  it('counts only structured filters (not search or sort)', () => {
    expect(activeFilterCount(defaultFilter)).toBe(0)
    expect(isFilterEmpty(defaultFilter)).toBe(true)

    const f: TxFilter = { ...defaultFilter, accountId: 'a1', tagIds: ['t1'], datePreset: 'this_month' }
    expect(activeFilterCount(f)).toBe(3)
    expect(isFilterEmpty(f)).toBe(false)
  })

  it('treats a lone search term as non-empty but uncounted', () => {
    const f: TxFilter = { ...defaultFilter, search: 'coffee', sort: 'amount_desc' }
    expect(activeFilterCount(f)).toBe(0)
    expect(isFilterEmpty(f)).toBe(false)
  })

  it('counts an amount bound once whether min, max or both', () => {
    expect(activeFilterCount({ ...defaultFilter, amountMin: '10' })).toBe(1)
    expect(activeFilterCount({ ...defaultFilter, amountMin: '10', amountMax: '50' })).toBe(1)
  })

  it('counts a reconciliation-status filter', () => {
    expect(activeFilterCount({ ...defaultFilter, status: 'cleared' })).toBe(1)
    expect(isFilterEmpty({ ...defaultFilter, status: 'reconciled' })).toBe(false)
  })
})
