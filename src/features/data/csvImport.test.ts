import { describe, it, expect } from 'vitest'
import {
  detectMapping,
  detectAmountSign,
  parseFlexibleDate,
  parseMappedCsv,
  type ImportConfig,
  type ParsedFile,
} from './csvImport'
import type { Account, Category } from '@/types/db'

function account(id: string, name: string, currency = 'USD'): Account {
  return {
    id,
    user_id: 'u1',
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
    created_at: '2024-01-01T00:00:00Z',
  }
}

function category(id: string, name: string): Category {
  return {
    id,
    user_id: 'u1',
    name,
    kind: 'expense',
    parent_id: null,
    icon: null,
    color: null,
    is_archived: false,
    sort_order: 0,
    created_at: '2024-01-01T00:00:00Z',
  }
}

const accounts = [account('a1', 'Checking'), account('a2', 'Savings')]
const categories = [category('c1', 'Food'), category('c2', 'Salary')]

describe('detectMapping', () => {
  it('matches columns by header name without reusing a column', () => {
    const m = detectMapping(['Date', 'Description', 'Amount', 'Currency'])
    expect(m.date).toBe(0)
    expect(m.payee).toBe(1) // "description" → payee
    expect(m.amount).toBe(2)
    expect(m.currency).toBe(3)
    expect(m.account).toBeNull()
  })

  it('suggests the type-column mode when a type column exists', () => {
    const m = detectMapping(['Date', 'Type', 'Amount'])
    expect(detectAmountSign(m)).toBe('type-column')
  })

  it('suggests the signed mode when there is no type column', () => {
    const m = detectMapping(['Date', 'Amount'])
    expect(detectAmountSign(m)).toBe('signed')
  })
})

describe('parseFlexibleDate', () => {
  it('parses ISO dates', () => {
    expect(parseFlexibleDate('2024-03-15')?.getFullYear()).toBe(2024)
  })
  it('prefers day-first for ambiguous slash dates', () => {
    const d = parseFlexibleDate('05/06/2024')!
    expect(d.getDate()).toBe(5)
    expect(d.getMonth()).toBe(5) // June (0-indexed)
  })
  it('detects day when the first part exceeds 12', () => {
    const d = parseFlexibleDate('15/06/2024')!
    expect(d.getDate()).toBe(15)
    expect(d.getMonth()).toBe(5)
  })
  it('returns null for nonsense', () => {
    expect(parseFlexibleDate('not a date')).toBeNull()
  })
})

function config(over: Partial<ImportConfig> = {}): ImportConfig {
  return {
    mapping: {
      date: 0,
      amount: 1,
      type: null,
      currency: null,
      account: null,
      category: null,
      counter_account: null,
      payee: null,
      note: null,
    },
    amountSign: 'signed',
    defaultAccountId: 'a1',
    defaultCurrency: 'USD',
    ...over,
  }
}

describe('parseMappedCsv', () => {
  it('derives income/expense from the amount sign', () => {
    const file: ParsedFile = {
      headers: ['date', 'amount'],
      rows: [
        ['2024-03-01', '-25.50'],
        ['2024-03-02', '1000'],
      ],
    }
    const res = parseMappedCsv(file, config(), accounts, categories)
    expect(res.errors).toHaveLength(0)
    expect(res.valid[0]).toMatchObject({ type: 'expense', amount: 2550, account_id: 'a1' })
    expect(res.valid[1]).toMatchObject({ type: 'income', amount: 100000 })
  })

  it('reads a type column and maps debit/credit words', () => {
    const file: ParsedFile = {
      headers: ['date', 'amount', 'kind'],
      rows: [
        ['2024-03-01', '25', 'debit'],
        ['2024-03-02', '25', 'credit'],
      ],
    }
    const res = parseMappedCsv(
      file,
      config({ mapping: { ...config().mapping, type: 2 }, amountSign: 'type-column' }),
      accounts,
      categories,
    )
    expect(res.valid[0].type).toBe('expense')
    expect(res.valid[1].type).toBe('income')
  })

  it('treats every row as an expense in all-expense mode', () => {
    const file: ParsedFile = { headers: ['date', 'amount'], rows: [['2024-03-01', '40']] }
    const res = parseMappedCsv(file, config({ amountSign: 'all-expense' }), accounts, categories)
    expect(res.valid[0]).toMatchObject({ type: 'expense', amount: 4000 })
  })

  it('resolves account and category by name', () => {
    const file: ParsedFile = {
      headers: ['date', 'amount', 'account', 'category'],
      rows: [['2024-03-01', '-10', 'Savings', 'Food']],
    }
    const res = parseMappedCsv(
      file,
      config({ mapping: { ...config().mapping, account: 2, category: 3 } }),
      accounts,
      categories,
    )
    expect(res.valid[0]).toMatchObject({ account_id: 'a2', category_id: 'c1' })
  })

  it('flags an unknown account', () => {
    const file: ParsedFile = {
      headers: ['date', 'amount', 'account'],
      rows: [['2024-03-01', '-10', 'Nope']],
    }
    const res = parseMappedCsv(
      file,
      config({ mapping: { ...config().mapping, account: 2 }, defaultAccountId: null }),
      accounts,
      categories,
    )
    expect(res.valid).toHaveLength(0)
    expect(res.errors[0].message).toContain('Unknown account')
  })

  it('requires a valid counter account for transfers', () => {
    const file: ParsedFile = {
      headers: ['date', 'amount', 'type'],
      rows: [['2024-03-01', '50', 'transfer']],
    }
    const res = parseMappedCsv(
      file,
      config({ mapping: { ...config().mapping, type: 2 }, amountSign: 'type-column' }),
      accounts,
      categories,
    )
    expect(res.valid).toHaveLength(0)
    expect(res.errors[0].message).toContain('Transfer')
  })
})
