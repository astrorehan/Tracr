import { supabase } from '@/lib/supabase'

/**
 * Full JSON backup/restore of everything the user owns. Portable across accounts
 * (restore re-stamps user_id to the current user and preserves original UUIDs so
 * relationships stay intact). Restore is an upsert — re-importing is idempotent
 * and overwrites rows with the same id.
 */

export const BACKUP_VERSION = 1

// Tables exported in dependency order; restore walks the same order.
const TABLES = [
  'accounts',
  'categories',
  'tags',
  'savings_goals',
  'budgets',
  'recurring_transactions',
  'transactions',
  'transaction_tags',
  'transaction_splits',
  'goal_contributions',
  'fx_rates',
  // Metadata only — the underlying Storage files aren't part of the JSON.
  'attachments',
] as const

type TableName = (typeof TABLES)[number]
type Row = Record<string, unknown>

export interface Backup {
  tracr_backup: number
  exported_at: string
  base_currency: string | null
  data: Record<TableName, Row[]>
}

/** Fetch every owned row across all tables into one JSON object. */
export async function buildBackup(baseCurrency: string | null): Promise<Backup> {
  const data = {} as Record<TableName, Row[]>
  for (const table of TABLES) {
    const { data: rows, error } = await supabase.from(table).select('*')
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

async function upsertRows(table: TableName, rows: Row[] | undefined, userId: string, onConflict: string) {
  if (!rows || rows.length === 0) return 0
  const payload = rows.map((r) => ({ ...r, user_id: userId }))
  const { error, count } = await supabase
    .from(table)
    .upsert(payload, { onConflict, count: 'exact' })
  if (error) throw error
  return count ?? rows.length
}

/** Restore a backup into the current user's account (upsert, relationships kept). */
export async function restoreBackup(backup: Backup): Promise<number> {
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('Not authenticated')
  const d = backup.data

  let total = 0
  total += await upsertRows('accounts', d.accounts, userId, 'id')

  // Categories self-reference via parent_id: insert parents before children.
  const cats = d.categories ?? []
  total += await upsertRows('categories', cats.filter((c) => !c.parent_id), userId, 'id')
  total += await upsertRows('categories', cats.filter((c) => c.parent_id), userId, 'id')

  total += await upsertRows('tags', d.tags, userId, 'id')
  total += await upsertRows('savings_goals', d.savings_goals, userId, 'id')
  total += await upsertRows('budgets', d.budgets, userId, 'id')
  total += await upsertRows('recurring_transactions', d.recurring_transactions, userId, 'id')
  total += await upsertRows('transactions', d.transactions, userId, 'id')
  // Join table has a composite primary key, not an id column.
  total += await upsertRows('transaction_tags', d.transaction_tags, userId, 'transaction_id,tag_id')
  total += await upsertRows('transaction_splits', d.transaction_splits, userId, 'id')
  total += await upsertRows('goal_contributions', d.goal_contributions, userId, 'id')
  total += await upsertRows('fx_rates', d.fx_rates, userId, 'id')
  total += await upsertRows('attachments', d.attachments, userId, 'id')

  return total
}
