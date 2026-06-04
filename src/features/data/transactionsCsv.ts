import { format } from 'date-fns'
import { toCsv, parseCsv } from '@/lib/csv'
import { fromMinorUnits, toMinorUnits } from '@/lib/money'
import type { Account, Category, Transaction, TransactionType } from '@/types/db'

const HEADER = ['date', 'type', 'amount', 'currency', 'account', 'category', 'counter_account', 'note']

/** Serialize transactions to a human-readable CSV (amounts in major units). */
export function buildTransactionsCsv(
  transactions: Transaction[],
  accountsById: Record<string, Account>,
  categoriesById: Record<string, Category>,
): string {
  const rows: (string | number)[][] = [HEADER]
  for (const tx of transactions) {
    rows.push([
      tx.occurred_at,
      tx.type,
      fromMinorUnits(tx.amount, tx.currency),
      tx.currency,
      accountsById[tx.account_id]?.name ?? '',
      tx.category_id ? (categoriesById[tx.category_id]?.name ?? '') : '',
      tx.counter_account_id ? (accountsById[tx.counter_account_id]?.name ?? '') : '',
      tx.note ?? '',
    ])
  }
  return toCsv(rows)
}

export interface ParsedTxRow {
  account_id: string
  category_id: string | null
  counter_account_id: string | null
  type: TransactionType
  amount: number
  currency: string
  occurred_at: string
  note: string | null
}

export interface ImportResult {
  valid: ParsedTxRow[]
  errors: { line: number; message: string }[]
  total: number
}

const TYPES: TransactionType[] = ['income', 'expense', 'transfer']

/** Parse a CSV against the user's accounts/categories, validating each row. */
export function parseTransactionsCsv(
  text: string,
  accounts: Account[],
  categories: Category[],
): ImportResult {
  const matrix = parseCsv(text)
  const result: ImportResult = { valid: [], errors: [], total: 0 }
  if (matrix.length < 2) {
    result.errors.push({ line: 0, message: 'File is empty or has no data rows.' })
    return result
  }

  const header = matrix[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const idx = {
    date: col('date'),
    type: col('type'),
    amount: col('amount'),
    currency: col('currency'),
    account: col('account'),
    category: col('category'),
    counter: col('counter_account'),
    note: col('note'),
  }
  for (const req of ['date', 'type', 'amount', 'account'] as const) {
    if (idx[req] === -1)
      result.errors.push({ line: 1, message: `Missing required column: "${req}".` })
  }
  if (result.errors.length) return result

  const accByName = new Map(accounts.map((a) => [a.name.trim().toLowerCase(), a]))
  const catByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]))

  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i]
    const line = i + 1
    result.total++

    const accName = (r[idx.account] ?? '').trim()
    const account = accByName.get(accName.toLowerCase())
    if (!account) {
      result.errors.push({ line, message: `Unknown account "${accName}".` })
      continue
    }

    const rawType = (r[idx.type] ?? '').trim().toLowerCase()
    if (!TYPES.includes(rawType as TransactionType)) {
      result.errors.push({ line, message: `Invalid type "${rawType}".` })
      continue
    }
    const type = rawType as TransactionType

    const currency = (idx.currency !== -1 && r[idx.currency]?.trim()) || account.currency
    const amount = toMinorUnits((r[idx.amount] ?? '').trim(), currency)
    if (!Number.isFinite(amount) || amount <= 0) {
      result.errors.push({ line, message: `Invalid amount "${r[idx.amount]}".` })
      continue
    }

    const parsedDate = new Date((r[idx.date] ?? '').trim())
    if (Number.isNaN(parsedDate.getTime())) {
      result.errors.push({ line, message: `Invalid date "${r[idx.date]}".` })
      continue
    }

    let counter_account_id: string | null = null
    if (type === 'transfer') {
      const counterName = (idx.counter !== -1 && r[idx.counter]?.trim()) || ''
      const counter = accByName.get(counterName.toLowerCase())
      if (!counter) {
        result.errors.push({ line, message: `Transfer needs a valid counter_account.` })
        continue
      }
      counter_account_id = counter.id
    }

    const catName = idx.category !== -1 ? (r[idx.category] ?? '').trim() : ''
    const category = catName ? catByName.get(catName.toLowerCase()) : undefined

    result.valid.push({
      account_id: account.id,
      category_id: type === 'transfer' ? null : (category?.id ?? null),
      counter_account_id,
      type,
      amount,
      currency,
      occurred_at: parsedDate.toISOString(),
      note: idx.note !== -1 ? (r[idx.note]?.trim() || null) : null,
    })
  }
  return result
}

/** A sample CSV users can use as an import template. */
export function sampleCsv(defaultAccount: string, currency: string): string {
  return toCsv([
    HEADER,
    [format(new Date(), 'yyyy-MM-dd'), 'expense', '25000', currency, defaultAccount, 'Food & Drink', '', 'Coffee'],
    [format(new Date(), 'yyyy-MM-dd'), 'income', '5000000', currency, defaultAccount, 'Salary', '', 'Payday'],
  ])
}
