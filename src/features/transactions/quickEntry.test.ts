import { describe, expect, it } from 'vitest'
import { parseQuickEntry, type QuickParseContext } from './quickEntry'
import type { Account, Category } from '@/types/db'

function acc(id: string, name: string, currency = 'IDR'): Account {
  return {
    id,
    user_id: 'u',
    book_id: 'b',
    name,
    type: 'cash',
    currency,
    opening_balance: 0,
    icon: null,
    color: null,
    is_archived: false,
    is_liability: false,
    credit_limit: null,
    exclude_from_stats: false,
    sort_order: 0,
    created_at: '',
  }
}

function cat(id: string, name: string, kind: 'income' | 'expense'): Category {
  return {
    id,
    user_id: 'u',
    book_id: 'b',
    name,
    kind,
    parent_id: null,
    icon: null,
    color: null,
    is_archived: false,
    sort_order: 0,
    created_at: '',
  }
}

const ctx: QuickParseContext = {
  accounts: [acc('a1', 'Cash'), acc('a2', 'BCA'), acc('a3', 'Chase', 'USD')],
  categories: [
    cat('c1', 'Food', 'expense'),
    cat('c2', 'Coffee', 'expense'),
    cat('c3', 'Salary', 'income'),
  ],
}

describe('parseQuickEntry — amount shorthand', () => {
  it('reads the k suffix as thousands (IDR, 0 decimals)', () => {
    const d = parseQuickEntry('25k kopi', ctx)
    expect(d.amountMinor).toBe(25_000)
    expect(d.type).toBe('expense')
  })

  it('reads rb and ribu as thousands', () => {
    expect(parseQuickEntry('50rb', ctx).amountMinor).toBe(50_000)
    expect(parseQuickEntry('50 ribu', ctx).amountMinor).toBe(50_000)
  })

  it('reads jt / juta as millions, with a decimal', () => {
    expect(parseQuickEntry('1.5jt gaji', ctx).amountMinor).toBe(1_500_000)
    expect(parseQuickEntry('2 juta', ctx).amountMinor).toBe(2_000_000)
  })

  it('reads a comma decimal in shorthand', () => {
    expect(parseQuickEntry('1,5jt', ctx).amountMinor).toBe(1_500_000)
  })

  it('treats dotted groups as thousands for a 0-decimal currency', () => {
    expect(parseQuickEntry('25.000 kopi', ctx).amountMinor).toBe(25_000)
  })

  it('reads the last separator as the decimal for a 2-decimal currency', () => {
    // "12.50 chase" → USD account → 12.50 → 1250 minor
    const d = parseQuickEntry('12.50 chase', ctx)
    expect(d.currency).toBe('USD')
    expect(d.amountMinor).toBe(1250)
  })

  it('returns null amount when there is no number', () => {
    expect(parseQuickEntry('kopi enak', ctx).amountMinor).toBeNull()
    expect(parseQuickEntry('kopi enak', ctx).confident).toBe(false)
  })
})

describe('parseQuickEntry — type detection', () => {
  it('defaults to expense', () => {
    expect(parseQuickEntry('25k kopi', ctx).type).toBe('expense')
  })

  it('flips to income on a keyword', () => {
    expect(parseQuickEntry('gaji 5jt', ctx).type).toBe('income')
    expect(parseQuickEntry('bonus 200k', ctx).type).toBe('income')
  })

  it('flips to income on a leading + sign', () => {
    expect(parseQuickEntry('+500k', ctx).type).toBe('income')
  })

  it('stays expense on a - sign even with an income-ish word absent', () => {
    expect(parseQuickEntry('-30k parkir', ctx).type).toBe('expense')
  })
})

describe('parseQuickEntry — account matching', () => {
  it('matches a wallet by name and marks it matched', () => {
    const d = parseQuickEntry('25k kopi bca', ctx)
    expect(d.accountId).toBe('a2')
    expect(d.accountMatched).toBe(true)
    expect(d.note).toBe('kopi')
  })

  it('falls back to the first wallet when none is named', () => {
    const d = parseQuickEntry('25k kopi', ctx)
    expect(d.accountId).toBe('a1')
    expect(d.accountMatched).toBe(false)
  })

  it('matches a multi-word wallet by one of its words', () => {
    const wide: QuickParseContext = {
      accounts: [acc('a1', 'Cash'), acc('a2', 'Livin Mandiri')],
      categories: [],
    }
    const d = parseQuickEntry('5jt gaji livin', wide)
    expect(d.accountId).toBe('a2')
    expect(d.accountMatched).toBe(true)
    expect(d.note).toBe('gaji')
  })

  it('prefers the full name over a word of another wallet', () => {
    const wide: QuickParseContext = {
      accounts: [acc('a1', 'Bank Mandiri'), acc('a2', 'Mandiri Syariah')],
      categories: [],
    }
    // "mandiri syariah" should resolve the second wallet (longer matched span).
    const d = parseQuickEntry('100k mandiri syariah', wide)
    expect(d.accountId).toBe('a2')
  })
})

describe('parseQuickEntry — category matching', () => {
  it('matches an expense category by name', () => {
    const d = parseQuickEntry('25k coffee bca', ctx)
    expect(d.categoryId).toBe('c2')
    expect(d.categoryMatched).toBe(true)
    expect(d.note).toBe('')
  })

  it('only matches categories of the entry kind', () => {
    // "Food" is an expense category; an income entry must not pick it up as its
    // category, even though the word appears in the text.
    const d = parseQuickEntry('gaji 5jt food', ctx)
    expect(d.type).toBe('income')
    expect(d.categoryId).toBeNull()
    expect(d.note).toContain('food')
  })

  it('matches an income category on an income entry', () => {
    const d = parseQuickEntry('gaji 5jt salary', ctx)
    expect(d.type).toBe('income')
    expect(d.categoryId).toBe('c3')
  })
})

describe('parseQuickEntry — note extraction & confidence', () => {
  it('leaves the leftover words as the note', () => {
    const d = parseQuickEntry('25k kopi susu bca', ctx)
    expect(d.note).toBe('kopi susu')
  })

  it('is confident with an amount and a wallet', () => {
    expect(parseQuickEntry('25k kopi', ctx).confident).toBe(true)
  })

  it('handles the report example "500 usd salary chase"', () => {
    const d = parseQuickEntry('500 usd salary chase', ctx)
    expect(d.currency).toBe('USD')
    expect(d.amountMinor).toBe(50_000) // 500.00 USD
    expect(d.type).toBe('income')
    expect(d.categoryId).toBe('c3')
    expect(d.accountId).toBe('a3')
    // "usd" is left in the note — harmless, and clearer than silently dropping it.
    expect(d.note).toContain('usd')
  })
})
