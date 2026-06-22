import { supabase } from '@/lib/supabase'

/**
 * JSON backup/restore of one book. Portable across accounts and books: restore
 * re-stamps user_id to the current user and book_id to the active book, while
 * preserving original UUIDs so relationships stay intact. Restore is an upsert —
 * re-importing is idempotent and overwrites rows with the same id.
 *
 * fx_rates are user-global (not book-scoped), so they're backed up as-is and
 * never re-stamped with a book_id.
 */

export const BACKUP_VERSION = 1

// Book-scoped tables, exported in dependency order; restore walks the same order.
const BOOK_TABLES = [
  'accounts',
  'categories',
  'tags',
  'rules',
  'savings_goals',
  'budgets',
  'recurring_transactions',
  'transaction_templates',
  'transactions',
  'transaction_tags',
  'transaction_splits',
  'goal_contributions',
  // Metadata only — the underlying Storage files aren't part of the JSON.
  'attachments',
] as const

// All tables that appear in a backup file (book-scoped + user-global fx_rates).
const TABLES = [...BOOK_TABLES, 'fx_rates'] as const

type TableName = (typeof TABLES)[number]
type Row = Record<string, unknown>

export interface Backup {
  tracr_backup: number
  exported_at: string
  base_currency: string | null
  data: Record<TableName, Row[]>
}

/** Fetch every row in the given book (plus user-global fx_rates) into one JSON object. */
export async function buildBackup(baseCurrency: string | null, bookId: string): Promise<Backup> {
  const data = {} as Record<TableName, Row[]>
  for (const table of TABLES) {
    let query = supabase.from(table).select('*')
    // fx_rates are user-global; everything else is scoped to the book.
    if (table !== 'fx_rates') query = query.eq('book_id', bookId)
    const { data: rows, error } = await query
    if (error) throw error
    data[table] = (rows ?? []) as Row[]
  }
  return {
    tracr_backup: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    base_currency: baseCurrency,
    data,
  }
}

/** Parse + validate JSON text into a Backup, throwing a friendly error if invalid. */
export function parseBackup(text: string): Backup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file isn’t valid JSON.')
  }
  const b = parsed as Partial<Backup>
  if (!b || typeof b.tracr_backup !== 'number' || typeof b.data !== 'object' || b.data === null) {
    throw new Error('This doesn’t look like a Tracr backup file.')
  }
  return b as Backup
}

/** Count of rows per table in a backup (for the restore preview). */
export function backupCounts(backup: Backup): { table: TableName; count: number }[] {
  return TABLES.map((table) => ({ table, count: backup.data[table]?.length ?? 0 }))
}

async function upsertRows(
  table: TableName,
  rows: Row[] | undefined,
  userId: string,
  onConflict: string,
  bookId: string | null,
) {
  if (!rows || rows.length === 0) return 0
  // Re-stamp ownership: always user_id, and book_id too for book-scoped tables
  // so a backup from any book lands in the book we're restoring into.
  const payload = rows.map((r) => ({ ...r, user_id: userId, ...(bookId ? { book_id: bookId } : {}) }))
  const { error, count } = await supabase
    .from(table)
    .upsert(payload, { onConflict, count: 'exact' })
  if (error) throw error
  return count ?? rows.length
}

/** Restore a backup into the active book (upsert, relationships kept). */
export async function restoreBackup(backup: Backup, bookId: string): Promise<number> {
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('Not authenticated')
  const d = backup.data

  let total = 0
  total += await upsertRows('accounts', d.accounts, userId, 'id', bookId)

  // Categories self-reference via parent_id: insert parents before children.
  const cats = d.categories ?? []
  total += await upsertRows('categories', cats.filter((c) => !c.parent_id), userId, 'id', bookId)
  total += await upsertRows('categories', cats.filter((c) => c.parent_id), userId, 'id', bookId)

  total += await upsertRows('tags', d.tags, userId, 'id', bookId)
  total += await upsertRows('rules', d.rules, userId, 'id', bookId)
  total += await upsertRows('savings_goals', d.savings_goals, userId, 'id', bookId)
  total += await upsertRows('budgets', d.budgets, userId, 'id', bookId)
  total += await upsertRows('recurring_transactions', d.recurring_transactions, userId, 'id', bookId)
  total += await upsertRows('transaction_templates', d.transaction_templates, userId, 'id', bookId)

  // Transactions self-reference via linked_transaction_id (refund/reimbursement).
  // Insert with the link cleared so a forward reference can't fail the FK, then
  // patch the links once every row exists.
  const txs = d.transactions ?? []
  total += await upsertRows(
    'transactions',
    txs.map((t) => ({ ...t, linked_transaction_id: null })),
    userId,
    'id',
    bookId,
  )
  for (const t of txs) {
    if (!t.linked_transaction_id) continue
    const { error } = await supabase
      .from('transactions')
      .update({ linked_transaction_id: t.linked_transaction_id })
      .eq('id', t.id as string)
    if (error) throw error
  }

  // Join table has a composite primary key, not an id column.
  total += await upsertRows(
    'transaction_tags',
    d.transaction_tags,
    userId,
    'transaction_id,tag_id',
    bookId,
  )
  total += await upsertRows('transaction_splits', d.transaction_splits, userId, 'id', bookId)
  total += await upsertRows('goal_contributions', d.goal_contributions, userId, 'id', bookId)
  // fx_rates are user-global — restore with no book_id stamp.
  total += await upsertRows('fx_rates', d.fx_rates, userId, 'id', null)
  total += await upsertRows('attachments', d.attachments, userId, 'id', bookId)

  return total
}
