import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subMonths,
  subQuarters,
  subWeeks,
} from 'date-fns'
import type { TransactionSource, TransactionStatus, TransactionType } from '@/types/db'
import type { MsgKey } from '@/i18n'

export type DatePreset =
  | 'all'
  | 'today'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'ytd'
  | 'last_12_months'
  | 'custom'

export type TxSort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
export type TagMatch = 'any' | 'all'

/** The full set of filters the Activity page can apply to a transaction list. */
export interface TxFilter {
  search: string
  accountId: string
  type: TransactionType | ''
  categoryId: string
  payee: string
  tagIds: string[]
  tagMatch: TagMatch
  datePreset: DatePreset
  customFrom: string
  customTo: string
  amountMin: string
  amountMax: string
  source: TransactionSource | ''
  status: TransactionStatus | ''
  sort: TxSort
}

export const defaultFilter: TxFilter = {
  search: '',
  accountId: '',
  type: '',
  categoryId: '',
  payee: '',
  tagIds: [],
  tagMatch: 'any',
  datePreset: 'all',
  customFrom: '',
  customTo: '',
  amountMin: '',
  amountMax: '',
  source: '',
  status: '',
  sort: 'date_desc',
}

// Option lists carry a message key, not a literal — the consumer runs it through
// `t()` at render so the dropdowns follow the active language.
export const DATE_PRESETS: { value: DatePreset; labelKey: MsgKey }[] = [
  { value: 'all', labelKey: 'range.all' },
  { value: 'today', labelKey: 'range.today' },
  { value: 'this_week', labelKey: 'range.thisWeek' },
  { value: 'last_week', labelKey: 'range.lastWeek' },
  { value: 'this_month', labelKey: 'range.thisMonth' },
  { value: 'last_month', labelKey: 'range.lastMonth' },
  { value: 'this_quarter', labelKey: 'range.thisQuarter' },
  { value: 'last_quarter', labelKey: 'range.lastQuarter' },
  { value: 'ytd', labelKey: 'range.ytd' },
  { value: 'last_12_months', labelKey: 'range.last12Months' },
  { value: 'custom', labelKey: 'range.custom' },
]

export const SORT_OPTIONS: { value: TxSort; labelKey: MsgKey }[] = [
  { value: 'date_desc', labelKey: 'sort.dateDesc' },
  { value: 'date_asc', labelKey: 'sort.dateAsc' },
  { value: 'amount_desc', labelKey: 'sort.amountDesc' },
  { value: 'amount_asc', labelKey: 'sort.amountAsc' },
]

export const SOURCE_OPTIONS: { value: TransactionSource; labelKey: MsgKey }[] = [
  { value: 'web', labelKey: 'src.web' },
  { value: 'import', labelKey: 'src.import' },
  { value: 'telegram', labelKey: 'src.telegram' },
  { value: 'whatsapp', labelKey: 'src.whatsapp' },
]

export const STATUS_OPTIONS: { value: TransactionStatus; labelKey: MsgKey }[] = [
  { value: 'pending', labelKey: 'txstatus.pending' },
  { value: 'cleared', labelKey: 'txstatus.cleared' },
  { value: 'reconciled', labelKey: 'txstatus.reconciled' },
]

const WEEK_OPTS = { weekStartsOn: 1 } as const // Monday-based weeks

export type DateRangeInput = Pick<TxFilter, 'datePreset' | 'customFrom' | 'customTo'>

/** Resolve the active date preset (or custom range) to ISO bounds for the query. */
export function resolveDateRange(f: DateRangeInput): { from?: string; to?: string } {
  const now = new Date()
  switch (f.datePreset) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() }
    case 'this_week':
      return {
        from: startOfWeek(now, WEEK_OPTS).toISOString(),
        to: endOfWeek(now, WEEK_OPTS).toISOString(),
      }
    case 'last_week': {
      const d = subWeeks(now, 1)
      return {
        from: startOfWeek(d, WEEK_OPTS).toISOString(),
        to: endOfWeek(d, WEEK_OPTS).toISOString(),
      }
    }
    case 'this_month':
      return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() }
    case 'last_month': {
      const d = subMonths(now, 1)
      return { from: startOfMonth(d).toISOString(), to: endOfMonth(d).toISOString() }
    }
    case 'this_quarter':
      return { from: startOfQuarter(now).toISOString(), to: endOfQuarter(now).toISOString() }
    case 'last_quarter': {
      const d = subQuarters(now, 1)
      return { from: startOfQuarter(d).toISOString(), to: endOfQuarter(d).toISOString() }
    }
    case 'ytd':
      return { from: startOfYear(now).toISOString(), to: endOfDay(now).toISOString() }
    case 'last_12_months':
      return { from: startOfDay(subMonths(now, 12)).toISOString(), to: endOfDay(now).toISOString() }
    case 'custom': {
      const out: { from?: string; to?: string } = {}
      if (f.customFrom) out.from = startOfDay(new Date(f.customFrom)).toISOString()
      if (f.customTo) out.to = endOfDay(new Date(f.customTo)).toISOString()
      return out
    }
    case 'all':
    default:
      return {}
  }
}

/**
 * The equal-length window immediately preceding a resolved range — for
 * period-over-period comparison. Returns {} when the range is open-ended
 * (no baseline to compare against, e.g. "All time").
 */
export function previousDateRange(r: { from?: string; to?: string }): { from?: string; to?: string } {
  if (!r.from || !r.to) return {}
  const fromMs = +new Date(r.from)
  const dur = +new Date(r.to) - fromMs
  const prevTo = fromMs - 1
  return { from: new Date(prevTo - dur).toISOString(), to: new Date(prevTo).toISOString() }
}

/** Count of "structured" filters in effect (search + sort are surfaced separately). */
export function activeFilterCount(f: TxFilter): number {
  let n = 0
  if (f.accountId) n++
  if (f.type) n++
  if (f.categoryId) n++
  if (f.payee.trim()) n++
  if (f.tagIds.length) n++
  if (f.datePreset !== 'all') n++
  if (f.amountMin || f.amountMax) n++
  if (f.source) n++
  if (f.status) n++
  return n
}

/** True when nothing other than the default sort is applied. */
export function isFilterEmpty(f: TxFilter): boolean {
  return !f.search.trim() && activeFilterCount(f) === 0
}
