import { toMinorUnits } from '@/lib/money'
import type { Account, Category, TransactionType } from '@/types/db'
import type { ImportResult, ParsedTxRow } from './transactionsCsv'

/**
 * Flexible CSV importer: instead of demanding our fixed column order, the user
 * maps each of their file's columns onto a Tracr field. Bank/app exports vary
 * wildly, so we also support three ways of expressing income vs expense and a
 * fallback default account when a file has no account column.
 */

export const TARGET_FIELDS = [
  'date',
  'amount',
  'type',
  'currency',
  'account',
  'category',
  'counter_account',
  'payee',
  'note',
] as const

export type TargetField = (typeof TARGET_FIELDS)[number]

/** Index into the file's columns for each Tracr field (null = unmapped). */
export type ColumnMapping = Record<TargetField, number | null>

export type AmountSign =
  /** A column states the type (income/expense/transfer, or debit/credit). */
  | 'type-column'
  /** One amount column; negative rows are expenses, positive are income. */
  | 'signed'
  /** Every row is an expense (e.g. a card statement of charges). */
  | 'all-expense'

export interface ImportConfig {
  mapping: ColumnMapping
  amountSign: AmountSign
  /** Used for every row when `mapping.account` is null. */
  defaultAccountId: string | null
  /** Used for every row when `mapping.currency` is null and the account has none. */
  defaultCurrency: string
}

export interface ParsedFile {
  headers: string[]
  rows: string[][]
}

/** Human labels for the mapping UI. */
export const FIELD_LABELS: Record<TargetField, string> = {
  date: 'Date',
  amount: 'Amount',
  type: 'Type (income / expense)',
  currency: 'Currency',
  account: 'Account',
  category: 'Category',
  counter_account: 'Transfer to (account)',
  payee: 'Payee / merchant',
  note: 'Note',
}

/** Header name fragments we auto-match for each field (first wins, no reuse). */
const SYNONYMS: Record<TargetField, string[]> = {
  date: ['date', 'time', 'posted', 'when'],
  amount: ['amount', 'value', 'total', 'sum', 'debit', 'paid'],
  type: ['type', 'kind', 'direction', 'dr/cr', 'cr/dr'],
  currency: ['currency', 'ccy', 'cur'],
  account: ['account', 'wallet', 'source'],
  category: ['category', 'cat'],
  counter_account: ['counter', 'destination', 'to account', 'transfer to'],
  payee: ['payee', 'merchant', 'vendor', 'description', 'name', 'payer', 'details'],
  note: ['note', 'memo', 'remark', 'comment', 'description'],
}

function emptyMapping(): ColumnMapping {
  return {
    date: null,
    amount: null,
    type: null,
    currency: null,
    account: null,
    category: null,
    counter_account: null,
    payee: null,
    note: null,
  }
}

/** Guess a column mapping from the header row by name similarity. */
export function detectMapping(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.trim().toLowerCase())
  const used = new Set<number>()
  const mapping = emptyMapping()

  for (const field of TARGET_FIELDS) {
    for (const frag of SYNONYMS[field]) {
      const idx = lower.findIndex((h, i) => !used.has(i) && h.includes(frag))
      if (idx !== -1) {
        mapping[field] = idx
        used.add(idx)
        break
      }
    }
  }
  return mapping
}

/** Suggest a sign mode based on whether a type-like column was found. */
export function detectAmountSign(mapping: ColumnMapping): AmountSign {
  return mapping.type !== null ? 'type-column' : 'signed'
}

const TYPE_WORDS: Record<string, TransactionType> = {
  income: 'income',
  expense: 'expense',
  transfer: 'transfer',
  credit: 'income',
  debit: 'expense',
  cr: 'income',
  dr: 'expense',
  in: 'income',
  out: 'expense',
  deposit: 'income',
  withdrawal: 'expense',
}

function parseTypeWord(raw: string): TransactionType | null {
  const w = raw.trim().toLowerCase()
  if (w in TYPE_WORDS) return TYPE_WORDS[w]
  if (w.startsWith('+')) return 'income'
  if (w.startsWith('-')) return 'expense'
  return null
}

/**
 * Parse a date that may be ISO, US (m/d/y) or day-first (d/m/y). For slash/dash
 * separated dates we disambiguate: if the first part is > 12 it must be the day.
 */
export function parseFlexibleDate(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null

  const m = s.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/)
  if (m) {
    const [, a, b, c] = m
    let year: number, month: number, day: number
    if (a.length === 4) {
      // yyyy-mm-dd
      year = +a
      month = +b
      day = +c
    } else {
      // dd/mm/yyyy or mm/dd/yyyy — prefer day-first unless the first part can't be a day.
      year = +c < 100 ? 2000 + +c : +c
      if (+a > 12) {
        day = +a
        month = +b
      } else if (+b > 12) {
        month = +a
        day = +b
      } else {
        day = +a
        month = +b
      }
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day)
      if (!Number.isNaN(d.getTime())) return d
    }
  }

  const fallback = new Date(s)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

const cell = (row: string[], idx: number | null) =>
  idx === null ? '' : (row[idx] ?? '').trim()

/** Parse a file against a user-defined mapping, validating each row. */
export function parseMappedCsv(
  file: ParsedFile,
  config: ImportConfig,
  accounts: Account[],
  categories: Category[],
): ImportResult {
  const result: ImportResult = { valid: [], errors: [], total: 0 }
  const { mapping, amountSign } = config

  const accByName = new Map(accounts.map((a) => [a.name.trim().toLowerCase(), a]))
  const catByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]))
  const defaultAccount = config.defaultAccountId
    ? accounts.find((a) => a.id === config.defaultAccountId)
    : undefined

  file.rows.forEach((row, i) => {
    const line = i + 2 // +1 for header, +1 for 1-based
    result.total++

    // Account — mapped column, else the chosen default.
    let account: Account | undefined
    if (mapping.account !== null) {
      const name = cell(row, mapping.account)
      account = accByName.get(name.toLowerCase()) ?? defaultAccount
      if (!account && name) {
        result.errors.push({ line, message: `Unknown account "${name}".` })
        return
      }
    } else {
      account = defaultAccount
    }
    if (!account) {
      result.errors.push({ line, message: 'No account for this row (pick a default account).' })
      return
    }

    const currency = cell(row, mapping.currency) || account.currency || config.defaultCurrency

    // Amount + type, three ways.
    const rawAmount = cell(row, mapping.amount)
    if (!rawAmount) {
      result.errors.push({ line, message: 'Missing amount.' })
      return
    }
    const signedMinor = toMinorUnits(rawAmount, currency)
    if (!Number.isFinite(signedMinor) || signedMinor === 0) {
      result.errors.push({ line, message: `Invalid amount "${rawAmount}".` })
      return
    }

    let type: TransactionType
    if (amountSign === 'type-column') {
      const raw = cell(row, mapping.type)
      const parsed = parseTypeWord(raw)
      if (!parsed) {
        result.errors.push({ line, message: `Unrecognized type "${raw}".` })
        return
      }
      type = parsed
    } else if (amountSign === 'signed') {
      type = signedMinor < 0 ? 'expense' : 'income'
    } else {
      type = 'expense'
    }

    const amount = Math.abs(signedMinor)

    // Transfers need a valid counter account.
    let counter_account_id: string | null = null
    if (type === 'transfer') {
      const counterName = cell(row, mapping.counter_account)
      const counter = accByName.get(counterName.toLowerCase())
      if (!counter) {
        result.errors.push({ line, message: 'Transfer row needs a valid "Transfer to" account.' })
        return
      }
      counter_account_id = counter.id
    }

    const date = parseFlexibleDate(cell(row, mapping.date))
    if (!date) {
      result.errors.push({ line, message: `Invalid date "${cell(row, mapping.date)}".` })
      return
    }

    const catName = cell(row, mapping.category)
    const category = catName ? catByName.get(catName.toLowerCase()) : undefined

    const parsed: ParsedTxRow = {
      account_id: account.id,
      category_id: type === 'transfer' ? null : (category?.id ?? null),
      counter_account_id,
      type,
      amount,
      currency,
      occurred_at: date.toISOString(),
      payee: type === 'transfer' ? null : cell(row, mapping.payee) || null,
      note: cell(row, mapping.note) || null,
    }
    result.valid.push(parsed)
  })

  return result
}

// ── Remembered mappings ──────────────────────────────────────────────────────
// Bank exports keep the same columns every month, so we cache the mapping keyed
// by the header signature and auto-apply it next time the same shape appears.

const PRESETS_KEY = 'tracr.csvImportPresets.v1'

type StoredPreset = Pick<ImportConfig, 'mapping' | 'amountSign'>

function presetKey(headers: string[]): string {
  return headers.map((h) => h.trim().toLowerCase()).join('|')
}

export function loadPreset(headers: string[]): StoredPreset | null {
  try {
    const all = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '{}') as Record<
      string,
      StoredPreset
    >
    return all[presetKey(headers)] ?? null
  } catch {
    return null
  }
}

export function savePreset(headers: string[], preset: StoredPreset): void {
  try {
    const all = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '{}') as Record<
      string,
      StoredPreset
    >
    all[presetKey(headers)] = preset
    localStorage.setItem(PRESETS_KEY, JSON.stringify(all))
  } catch {
    // Storage full or blocked — presets are a convenience, so ignore.
  }
}
