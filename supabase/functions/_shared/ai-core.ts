// Shared AI agent core. The exact same tool-calling brain is used by two edge
// functions that differ ONLY in how the Supabase client is built and scoped:
//
//   * ai-analysis  — called from the browser under the CALLER'S JWT. Postgres
//                    RLS enforces per-user isolation. ctx.supabase is the
//                    user-scoped client.
//   * wa-webhook   — called by Meta with no user session, so it runs as SERVICE
//                    ROLE. There is NO RLS backstop: ctx.supabase is the service
//                    client and every helper here MUST filter by book_id (and the
//                    webhook resolves book_id/user_id from the phone → link table
//                    before calling in). Audit every query below for a scope
//                    filter before shipping the webhook.
//
// The tool loop, tool schema, validation, and document extraction are identical
// across both — that's the whole point of sharing them.
import OpenAI from 'npm:openai'

// --- money formatting (mirror of src/lib/currencies.ts minor-unit places) ---
const DECIMALS: Record<string, number> = {
  IDR: 0, USD: 2, EUR: 2, SGD: 2, MYR: 2, JPY: 0, GBP: 2, AUD: 2,
  BTC: 8, ETH: 8, USDT: 2,
}
export const decimalsOf = (code: string) => DECIMALS[code] ?? 2
export function formatMoney(minor: number, currency: string): string {
  const d = decimalsOf(currency)
  const major = minor / 10 ** d
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d,
    }).format(major)
  } catch {
    return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(major)} ${currency}`
  }
}

// --- FX (port of src/features/fx/fx.ts — keep the two in step) --------------
//
// Conversion is DISPLAY-ONLY: stored native amounts are never rewritten, we only
// estimate a total in the base currency. A rate row means 1 unit of `base` =
// `rate` units of `quote`. Latest row per directed pair wins; inverses are
// derived; anything else triangulates through the user's base currency.
//
// This mirrors what AccountsPage shows so the assistant and the dashboard can
// never quote two different net worths. If you change one, change the other.
interface FxRow {
  base: string
  quote: string
  rate: number
  as_of: string
}
export interface RateTable {
  pairs: Map<string, number>
  base: string
}
const pairKey = (from: string, to: string) => `${from}>${to}`

export function buildRateTable(rates: FxRow[], baseCurrency: string): RateTable {
  const best = new Map<string, FxRow>()
  for (const r of rates ?? []) {
    const k = pairKey(r.base, r.quote)
    const cur = best.get(k)
    if (!cur || r.as_of > cur.as_of) best.set(k, r)
  }
  const pairs = new Map<string, number>()
  for (const r of best.values()) {
    pairs.set(pairKey(r.base, r.quote), Number(r.rate))
    // Only fill the inverse if it wasn't given explicitly.
    const inv = pairKey(r.quote, r.base)
    if (!best.has(inv)) pairs.set(inv, 1 / Number(r.rate))
  }
  return { pairs, base: baseCurrency }
}

export function rateBetween(from: string, to: string, table: RateTable): number | null {
  if (from === to) return 1
  const direct = table.pairs.get(pairKey(from, to))
  if (direct != null) return direct
  const fromBase = from === table.base ? 1 : table.pairs.get(pairKey(from, table.base))
  const baseTo = to === table.base ? 1 : table.pairs.get(pairKey(table.base, to))
  if (fromBase != null && baseTo != null) return fromBase * baseTo
  return null
}

/** Minor units of `from` → minor units of `to`, accounting for differing decimal
 *  places. Null when no rate is known — callers must surface that rather than
 *  fall back to zero, or the total silently under-reports. */
export function convertMinor(minor: number, from: string, to: string, table: RateTable): number | null {
  if (from === to) return minor
  const rate = rateBetween(from, to, table)
  if (rate == null) return null
  const major = minor / 10 ** decimalsOf(from)
  return Math.round(major * rate * 10 ** decimalsOf(to))
}

/** Account types that are debts by nature — mirrors LIABILITY_TYPES in
 *  src/features/accounts/meta.ts. Used to default the liability flag. */
const ACCOUNT_TYPES = [
  'cash', 'bank_card', 'credit_card', 'e_wallet', 'crypto', 'stocks', 'loan', 'receivable', 'other',
] as const
const LIABILITY_TYPES = new Set(['credit_card', 'loan'])

// --- the tools the model is allowed to call (OpenAI function schema) ---
// deno-lint-ignore no-explicit-any
export const tools: any[] = [
  {
    type: 'function',
    function: {
      name: 'period_totals',
      description:
        'Total income, spending and net for a date range, one row per currency. ' +
        'To compare two periods (e.g. this month vs last month), call this twice.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Start date, inclusive, YYYY-MM-DD.' },
          end: { type: 'string', description: 'End date, inclusive, YYYY-MM-DD.' },
        },
        required: ['start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spending_summary',
      description:
        'Totals for a date range grouped by category, by month, or by account. ' +
        'Use group_by="category" to find where money went.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Start date, inclusive, YYYY-MM-DD.' },
          end: { type: 'string', description: 'End date, inclusive, YYYY-MM-DD.' },
          group_by: { type: 'string', enum: ['category', 'month', 'account'] },
          type: { type: 'string', enum: ['expense', 'income'], description: 'Defaults to expense.' },
        },
        required: ['start', 'end', 'group_by'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'top_transactions',
      description: 'The largest individual transactions in a date range (max 20).',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Start date, inclusive, YYYY-MM-DD.' },
          end: { type: 'string', description: 'End date, inclusive, YYYY-MM-DD.' },
          type: { type: 'string', enum: ['expense', 'income'], description: 'Defaults to expense.' },
          limit: { type: 'integer', description: '1–20, default 10.' },
        },
        required: ['start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'budget_status',
      description:
        "Each budget's limit vs how much has been spent in its current period, " +
        'with percent used. Use to find budgets that are over or nearly over.',
      parameters: {
        type: 'object',
        properties: {
          asof: { type: 'string', description: 'Reference date YYYY-MM-DD; defaults to today.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_accounts',
      description:
        "The user's wallets/accounts (name and currency). Call before recording " +
        'a transaction when you need to know which account to use or what exists.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'net_worth',
      description:
        'Current net worth: everything owned minus everything owed, valued in the ' +
        "user's base currency, plus each account's own balance. Use for questions " +
        'like "how much do I have?", "what am I worth?", "how much is in my wallet?".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description:
        'The categories in this ledger. Call this BEFORE recording a transaction ' +
        'so you can put it in the right one, and before create_category so you ' +
        "don't duplicate an existing category.",
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['expense', 'income'],
            description: 'Only categories of this kind. Omit for both.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_category',
      description:
        'Create a category, then use it on a transaction. Call this ONLY when you ' +
        'have checked list_categories and nothing existing reasonably fits — prefer ' +
        'an existing category every time. Good reason to create: the spending is ' +
        'specific and recurring and has no home yet. Bad reason: a one-off purchase ' +
        'that fits a broader category you already have. If the name already exists ' +
        'the existing one is returned instead of a duplicate. Always tell the user ' +
        'when you created a category.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short, plain name, e.g. "Coffee".' },
          kind: { type: 'string', enum: ['expense', 'income'] },
          parent_name: {
            type: 'string',
            description:
              'Optional existing category of the same kind to nest this under, e.g. ' +
              '"Food" for a new "Coffee". Must already exist.',
          },
        },
        required: ['name', 'kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_account',
      description:
        'Create a wallet/account (a place money sits, e.g. a bank account, cash, an ' +
        'e-wallet, a credit card). Call ONLY after the user has explicitly confirmed ' +
        'the name, type and currency in this conversation — never on your own ' +
        'initiative, and never to work around a transaction whose account you could ' +
        'not resolve (ask which existing account instead).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'What the user calls it, e.g. "BCA" or "Cash".' },
          type: {
            type: 'string',
            enum: [...ACCOUNT_TYPES],
            description:
              'credit_card and loan are debts. receivable is money owed TO the user.',
          },
          currency: { type: 'string', description: 'ISO code, e.g. IDR.' },
          opening_balance: {
            type: 'number',
            description:
              'How much is in it right now, MAJOR units, not negative. For a debt ' +
              '(credit_card/loan) this is how much is OWED. Defaults to 0.',
          },
          credit_limit: {
            type: 'number',
            description: 'Major units. Only meaningful for a credit_card or loan.',
          },
        },
        required: ['name', 'type', 'currency'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_transactions',
      description:
        'Find already-recorded transactions, newest first. Use to answer "when did ' +
        'I…", "how much was…", and ALWAYS before update_transaction or ' +
        'delete_transaction — those need the id this returns. Combine filters to ' +
        'narrow down; with no filters you get the most recent ones.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Free text matched against the note and the merchant/payee.',
          },
          start: { type: 'string', description: 'Earliest date, inclusive, YYYY-MM-DD.' },
          end: { type: 'string', description: 'Latest date, inclusive, YYYY-MM-DD.' },
          type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
          account_name: { type: 'string' },
          category_name: { type: 'string' },
          limit: { type: 'integer', description: '1–20, default 10.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_transaction',
      description:
        'Change one already-recorded transaction. Find it with search_transactions ' +
        'first, show the user what you found, and call this ONLY after they ' +
        'explicitly confirm the change. Pass only the fields that change. To ' +
        'switch between expense and income, delete it and record it again instead.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The id from search_transactions.' },
          amount: { type: 'number', description: 'New amount in MAJOR units, > 0.' },
          occurred_at: { type: 'string', description: 'New date, YYYY-MM-DD.' },
          account_name: { type: 'string', description: 'Move it to this account (same currency).' },
          category_name: { type: 'string' },
          payee: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_transaction',
      description:
        'Permanently remove one transaction. Find it with search_transactions ' +
        'first, tell the user exactly what you are about to delete (amount, date, ' +
        'account), and call this ONLY after they explicitly confirm. This cannot ' +
        'be undone. Never delete more than the one thing the user asked for.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'The id from search_transactions.' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_transfer',
      description:
        'Move money between two of the user\'s own accounts (e.g. bank to cash, or ' +
        'topping up an e-wallet). This is NOT spending — net worth does not change. ' +
        'Call ONLY after the user explicitly confirms. If the two accounts use ' +
        'different currencies you must also pass to_amount.',
      parameters: {
        type: 'object',
        properties: {
          from_account_name: { type: 'string', description: 'Account the money leaves.' },
          to_account_name: { type: 'string', description: 'Account the money arrives in.' },
          amount: {
            type: 'number',
            description: 'MAJOR units taken out, in the FROM account currency.',
          },
          to_amount: {
            type: 'number',
            description:
              'MAJOR units that arrived, in the TO account currency. Required only ' +
              'when the two accounts use different currencies; ask the user for it.',
          },
          occurred_at: { type: 'string', description: 'YYYY-MM-DD; defaults to today.' },
          note: { type: 'string' },
        },
        required: ['from_account_name', 'to_account_name', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'goal_progress',
      description:
        "The user's savings goals: target, how much is put aside, what is left, and " +
        'the target date. Money in a goal is tracked separately and does not move ' +
        'real account balances.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_recurring',
      description:
        'Bills and subscriptions that repeat, with how often and when each is next ' +
        'due. Use for "what bills do I have?" and before create_recurring so you ' +
        "don't add one that already exists.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_recurring',
      description:
        'Set up a bill or subscription that repeats (rent, Netflix, salary). Call ' +
        'ONLY after the user explicitly confirms the amount, how often it repeats, ' +
        'and the next date it is due. This does NOT record a transaction now — it ' +
        'schedules future ones. With auto_post the app writes each one automatically ' +
        'when due; otherwise it just reminds. Default to auto_post false unless the ' +
        'user says they want it recorded automatically.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'What it is, e.g. "Netflix".' },
          type: { type: 'string', enum: ['expense', 'income'] },
          amount: { type: 'number', description: 'MAJOR units, > 0.' },
          currency: { type: 'string', description: 'ISO code. Must match the account.' },
          account_name: { type: 'string', description: 'Which account it comes out of / into.' },
          category_name: { type: 'string' },
          frequency: { type: 'string', enum: ['weekly', 'monthly', 'yearly'] },
          interval: {
            type: 'integer',
            description: 'Repeat every N periods. 1 = every week/month/year. Default 1.',
          },
          next_due: { type: 'string', description: 'Next date it is due, YYYY-MM-DD.' },
          auto_post: { type: 'boolean', description: 'Record it automatically when due. Default false.' },
          note: { type: 'string' },
        },
        required: ['name', 'type', 'amount', 'currency', 'frequency', 'next_due'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_transaction',
      description:
        'Write ONE expense or income into the ledger. Call ONLY after the user ' +
        'has explicitly confirmed in this conversation that they want it recorded ' +
        '(never on your own initiative). Amount is in MAJOR units (e.g. 25000 for ' +
        'Rp 25.000, 9.99 for $9.99). The currency must match the target account.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['expense', 'income'] },
          amount: { type: 'number', description: 'Major units, > 0. E.g. 25000 = Rp 25.000.' },
          currency: { type: 'string', description: 'ISO code, e.g. IDR. Must match the account.' },
          occurred_at: { type: 'string', description: 'YYYY-MM-DD; defaults to today.' },
          account_name: {
            type: 'string',
            description: 'Which wallet/account. Omit only if the user has exactly one.',
          },
          category_name: { type: 'string', description: 'Category name if the user gave/agreed one.' },
          payee: { type: 'string', description: 'Merchant / store name if known.' },
          note: { type: 'string', description: 'Short description, e.g. main items bought.' },
        },
        required: ['type', 'amount', 'currency'],
      },
    },
  },
]

type Row = Record<string, unknown>
const fmtRows = (rows: Row[], map: (r: Row) => Row) => (rows ?? []).map(map)

/** Live accounts in this book. Every caller filters by book_id — under the
 *  service role that filter IS the isolation, not a nicety. */
async function loadAccounts(ctx: ToolCtx): Promise<Row[] | { error: string }> {
  const { data, error } = await ctx.supabase
    .from('accounts')
    .select('id, name, currency')
    .eq('book_id', ctx.bookId)
    .eq('is_archived', false)
    .order('sort_order')
  if (error) return { error: error.message }
  return data ?? []
}

/** Exact name match first, then a contains match; when the user has exactly one
 *  account and named none, that one. Undefined means "ask the user". */
function matchAccount(accounts: Row[], wanted: string): Row | undefined {
  const want = wanted.trim().toLowerCase()
  if (!want) return accounts.length === 1 ? accounts[0] : undefined
  return (
    accounts.find((a) => String(a.name).toLowerCase() === want) ??
    accounts.find((a) => String(a.name).toLowerCase().includes(want))
  )
}

/** A category id in this book matching `name` and `kind`, or null. */
async function resolveCategoryId(
  ctx: ToolCtx,
  name: string,
  kind: string,
): Promise<string | null> {
  const wanted = name.trim()
  if (!wanted) return null
  const { data } = await ctx.supabase
    .from('categories')
    .select('id')
    .eq('book_id', ctx.bookId)
    .eq('kind', kind)
    .eq('is_archived', false)
    .ilike('name', `%${wanted}%`)
    .limit(1)
  return data?.[0]?.id ?? null
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

/** Same-currency snapshots are exact; cross-currency valuation is left to the
 *  app (mirrors withFxSnapshot leaving base_amount null when no rate is known). */
const baseSnapshot = (minor: number, currency: string, baseCurrency: string) =>
  currency === baseCurrency ? { base_amount: minor, fx_rate: 1 } : { base_amount: null, fx_rate: null }

/** Everything runTool needs beyond the call itself. `onRecorded` lets the
 *  request handler flag the response so the client can refresh its caches.
 *
 *  In wa-webhook `supabase` is the SERVICE-ROLE client — there is no RLS, so
 *  `bookId`/`userId` here are the security boundary. Never pass values that were
 *  not resolved from whatsapp_links for the sending phone. */
export interface ToolCtx {
  // deno-lint-ignore no-explicit-any
  supabase: any
  bookId: string
  userId: string
  baseCurrency: string
  /** How the row is stamped in transactions.source — must be a value of the
   *  transaction_source enum ('web' | 'whatsapp' | 'telegram' | 'import'). */
  source?: string
  onRecorded: () => void
}

// Dispatch one model tool call and shape the result for the model. Money
// columns are formatted to strings here so the model never does minor-unit
// arithmetic — it just quotes what it gets. Every read is `.eq('book_id', …)`.
export async function runTool(ctx: ToolCtx, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { supabase, bookId } = ctx
  const start = String(args.start ?? '')
  const end = String(args.end ?? '')

  if (name === 'period_totals') {
    const { data, error } = await supabase.rpc('ai_period_totals', {
      p_book_id: bookId, p_start: start, p_end: end,
    })
    if (error) return { error: error.message }
    return {
      rows: fmtRows(data, (r) => ({
        currency: r.currency,
        income: formatMoney(Number(r.income_minor), String(r.currency)),
        spending: formatMoney(Number(r.expense_minor), String(r.currency)),
        net: formatMoney(Number(r.net_minor), String(r.currency)),
        transactions: r.txn_count,
      })),
    }
  }

  if (name === 'spending_summary') {
    const { data, error } = await supabase.rpc('ai_spending_summary', {
      p_book_id: bookId, p_start: start, p_end: end,
      p_type: (args.type as string) ?? 'expense',
      p_group_by: (args.group_by as string) ?? 'category',
    })
    if (error) return { error: error.message }
    return {
      rows: fmtRows(data, (r) => ({
        name: r.bucket,
        currency: r.currency,
        total: formatMoney(Number(r.total_minor), String(r.currency)),
        transactions: r.txn_count,
      })),
    }
  }

  if (name === 'top_transactions') {
    const { data, error } = await supabase.rpc('ai_top_transactions', {
      p_book_id: bookId, p_start: start, p_end: end,
      p_type: (args.type as string) ?? 'expense',
      p_limit: Number(args.limit ?? 10),
    })
    if (error) return { error: error.message }
    return {
      rows: fmtRows(data, (r) => ({
        date: r.occurred_on,
        amount: formatMoney(Number(r.amount_minor), String(r.currency)),
        category: r.category,
        account: r.account,
        note: r.note,
      })),
    }
  }

  if (name === 'budget_status') {
    const { data, error } = await supabase.rpc('ai_budget_status', {
      p_book_id: bookId, p_asof: (args.asof as string) || new Date().toISOString().slice(0, 10),
    })
    if (error) return { error: error.message }
    return {
      rows: fmtRows(data, (r) => ({
        category: r.category,
        period: r.period,
        currency: r.currency,
        limit: formatMoney(Number(r.limit_minor), String(r.currency)),
        spent: formatMoney(Number(r.spent_minor), String(r.currency)),
        percent_used: r.pct,
      })),
    }
  }

  if (name === 'list_accounts') {
    const { data, error } = await supabase
      .from('accounts')
      .select('name, currency')
      .eq('book_id', bookId)
      .eq('is_archived', false)
      .order('sort_order')
    if (error) return { error: error.message }
    return { rows: data ?? [] }
  }

  if (name === 'list_categories') {
    let query = supabase
      .from('categories')
      .select('id, name, kind, parent_id')
      .eq('book_id', bookId)
      .eq('is_archived', false)
    const kind = String(args.kind ?? '')
    if (kind === 'expense' || kind === 'income') query = query.eq('kind', kind)
    const { data, error } = await query.order('sort_order')
    if (error) return { error: error.message }

    // Resolve parent names locally so the model sees "Food > Coffee" rather than
    // uuids it would only be tempted to echo back.
    const byId = new Map((data ?? []).map((c: Row) => [c.id, c.name]))
    return {
      rows: (data ?? []).map((c: Row) => ({
        name: c.name,
        kind: c.kind,
        parent: c.parent_id ? byId.get(c.parent_id) ?? null : null,
      })),
    }
  }

  if (name === 'net_worth') return netWorth(ctx)
  if (name === 'create_category') return createCategory(ctx, args)
  if (name === 'create_account') return createAccount(ctx, args)
  if (name === 'record_transaction') return recordTransaction(ctx, args)
  if (name === 'search_transactions') return searchTransactions(ctx, args)
  if (name === 'update_transaction') return updateTransaction(ctx, args)
  if (name === 'delete_transaction') return deleteTransaction(ctx, args)
  if (name === 'record_transfer') return recordTransfer(ctx, args)
  if (name === 'goal_progress') return goalProgress(ctx)
  if (name === 'list_recurring') return listRecurring(ctx)
  if (name === 'create_recurring') return createRecurring(ctx, args)

  return { error: `unknown tool: ${name}` }
}

/** Find recorded transactions. Returns the row id, which is the handle
 *  update_transaction and delete_transaction need — nothing else can identify a
 *  row, and we never trust an id the model supplies without re-checking it
 *  belongs to this book. */
export async function searchTransactions(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> {
  const { supabase, bookId } = ctx

  const accounts = await loadAccounts(ctx)
  if ('error' in accounts) return accounts
  const accountById = new Map(accounts.map((a) => [String(a.id), String(a.name)]))

  let query = supabase
    .from('transactions')
    .select('id, occurred_at, type, amount, currency, note, payee, account_id, counter_account_id, category_id')
    .eq('book_id', bookId)

  const start = String(args.start ?? '')
  const end = String(args.end ?? '')
  if (start && isDate(start)) query = query.gte('occurred_at', `${start}T00:00:00Z`)
  if (end && isDate(end)) query = query.lte('occurred_at', `${end}T23:59:59Z`)

  const type = String(args.type ?? '')
  if (type === 'expense' || type === 'income' || type === 'transfer') query = query.eq('type', type)

  const accountName = String(args.account_name ?? '').trim()
  if (accountName) {
    const account = matchAccount(accounts, accountName)
    if (!account) return { error: `no account matching "${accountName}"`, accounts: accounts.map((a) => a.name) }
    query = query.eq('account_id', account.id)
  }

  const categoryName = String(args.category_name ?? '').trim()
  if (categoryName) {
    const { data: cats } = await supabase
      .from('categories').select('id').eq('book_id', bookId).ilike('name', `%${categoryName}%`)
    const ids = (cats ?? []).map((c: Row) => c.id)
    if (!ids.length) return { rows: [], note: `no category matching "${categoryName}"` }
    query = query.in('category_id', ids)
  }

  const text = String(args.query ?? '').trim()
  if (text) {
    // Commas and parens would break PostgREST's or() filter grammar.
    const safe = text.replace(/[,()]/g, ' ').trim()
    if (safe) query = query.or(`note.ilike.%${safe}%,payee.ilike.%${safe}%`)
  }

  const limit = Math.min(20, Math.max(1, Number(args.limit ?? 10) || 10))
  const { data, error } = await query.order('occurred_at', { ascending: false }).limit(limit)
  if (error) return { error: error.message }

  const categoryIds = [...new Set((data ?? []).map((r: Row) => r.category_id).filter(Boolean))]
  const categoryById = new Map<string, string>()
  if (categoryIds.length) {
    const { data: cats } = await supabase.from('categories').select('id, name').in('id', categoryIds)
    for (const c of cats ?? []) categoryById.set(String(c.id), String(c.name))
  }

  return {
    rows: fmtRows(data, (r) => ({
      id: r.id,
      date: String(r.occurred_at).slice(0, 10),
      type: r.type,
      amount: formatMoney(Number(r.amount), String(r.currency)),
      account: accountById.get(String(r.account_id)) ?? null,
      ...(r.type === 'transfer'
        ? { to_account: accountById.get(String(r.counter_account_id)) ?? null }
        : { category: r.category_id ? categoryById.get(String(r.category_id)) ?? null : null }),
      payee: r.payee,
      note: r.note,
    })),
  }
}

/** Load one transaction and prove it belongs to this book before touching it.
 *  The id came from the model, so it is untrusted input like any other. */
async function loadOwnTransaction(ctx: ToolCtx, id: string): Promise<Row | { error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'id is not a transaction id from search_transactions' }
  const { data, error } = await ctx.supabase
    .from('transactions')
    .select('id, type, amount, currency, occurred_at, note, payee, account_id, category_id')
    .eq('id', id)
    .eq('book_id', ctx.bookId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'no such transaction in this ledger — search for it again' }
  return data as Row
}

export async function updateTransaction(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> {
  const { supabase, bookId, baseCurrency } = ctx

  const existing = await loadOwnTransaction(ctx, String(args.id ?? ''))
  if ('error' in existing) return existing

  const currency = String(existing.currency)
  const type = String(existing.type)
  const patch: Row = {}

  if (args.amount != null) {
    const major = Number(args.amount)
    if (!Number.isFinite(major) || major <= 0) return { error: 'amount must be > 0' }
    const minor = Math.round(major * 10 ** decimalsOf(currency))
    if (minor <= 0 || minor > 1e15) return { error: 'amount out of range' }
    patch.amount = minor
    // The frozen base-currency value has to move with the amount or reports drift.
    Object.assign(patch, baseSnapshot(minor, currency, baseCurrency))
  }

  if (args.occurred_at != null) {
    const date = String(args.occurred_at).trim()
    if (!isDate(date)) return { error: 'occurred_at must be YYYY-MM-DD' }
    if (Date.parse(date) > Date.now() + 86_400_000) return { error: 'date is in the future' }
    patch.occurred_at = `${date}T12:00:00Z`
  }

  if (args.note != null) patch.note = String(args.note).trim().slice(0, 500) || null

  // A transfer has two sides and no category or payee; editing those here would
  // produce a row the app can't render. Amount/date/note are safe.
  if (type === 'transfer') {
    if (args.account_name != null || args.category_name != null || args.payee != null) {
      return {
        error:
          'this is a transfer between accounts — only its amount, date and note can be ' +
          'changed here. Delete it and record it again to change the accounts.',
      }
    }
  } else {
    if (args.payee != null) patch.payee = String(args.payee).trim().slice(0, 120) || null

    if (args.category_name != null) {
      const wanted = String(args.category_name).trim()
      if (!wanted) patch.category_id = null
      else {
        const categoryId = await resolveCategoryId(ctx, wanted, type)
        if (!categoryId) return { error: `no ${type} category matching "${wanted}" — check list_categories` }
        patch.category_id = categoryId
      }
    }

    if (args.account_name != null) {
      const accounts = await loadAccounts(ctx)
      if ('error' in accounts) return accounts
      const account = matchAccount(accounts, String(args.account_name))
      if (!account) {
        return {
          error: 'account not resolved — ask the user which one',
          accounts: accounts.map((a) => ({ name: a.name, currency: a.currency })),
        }
      }
      if (String(account.currency) !== currency) {
        return {
          error: `"${account.name}" uses ${account.currency} but this transaction is in ${currency}`,
        }
      }
      patch.account_id = account.id
    }
  }

  if (Object.keys(patch).length === 0) return { error: 'nothing to change' }

  const { error } = await supabase.from('transactions').update(patch).eq('id', existing.id).eq('book_id', bookId)
  if (error) return { error: error.message }

  ctx.onRecorded()
  const updated = await loadOwnTransaction(ctx, String(existing.id))
  if ('error' in updated) return { ok: true }
  return {
    ok: true,
    updated: {
      date: String(updated.occurred_at).slice(0, 10),
      type: updated.type,
      amount: formatMoney(Number(updated.amount), String(updated.currency)),
      note: updated.note,
    },
  }
}

export async function deleteTransaction(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> {
  const existing = await loadOwnTransaction(ctx, String(args.id ?? ''))
  if ('error' in existing) return existing

  // Tags, splits and attachments cascade; a refund pointing here is unlinked.
  const { error } = await ctx.supabase
    .from('transactions').delete().eq('id', existing.id).eq('book_id', ctx.bookId)
  if (error) return { error: error.message }

  ctx.onRecorded()
  return {
    ok: true,
    deleted: {
      date: String(existing.occurred_at).slice(0, 10),
      type: existing.type,
      amount: formatMoney(Number(existing.amount), String(existing.currency)),
      note: existing.note,
    },
  }
}

/** Money between two of the user's own accounts. Stored as ONE row: the from
 *  account is debited `amount`, the to account credited `counter_amount` (null
 *  when both sides share a currency) — that is what account_balances reads. */
export async function recordTransfer(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> {
  const { supabase, bookId, userId, baseCurrency } = ctx

  const accounts = await loadAccounts(ctx)
  if ('error' in accounts) return accounts
  if (accounts.length < 2) return { error: 'a transfer needs two accounts; this ledger has fewer' }

  const from = matchAccount(accounts, String(args.from_account_name ?? ''))
  const to = matchAccount(accounts, String(args.to_account_name ?? ''))
  if (!from || !to) {
    return {
      error: 'could not tell which accounts — ask the user',
      accounts: accounts.map((a) => ({ name: a.name, currency: a.currency })),
    }
  }
  if (String(from.id) === String(to.id)) return { error: 'the two accounts must be different' }

  const fromCurrency = String(from.currency)
  const toCurrency = String(to.currency)

  const major = Number(args.amount)
  if (!Number.isFinite(major) || major <= 0) return { error: 'amount must be > 0' }
  const minor = Math.round(major * 10 ** decimalsOf(fromCurrency))
  if (minor <= 0 || minor > 1e15) return { error: 'amount out of range' }

  // Cross-currency: the destination is credited its own figure, which only the
  // user knows (the bank's rate, fees included). Never guess it.
  let counterAmount: number | null = null
  let counterFxRate: number | null = null
  if (fromCurrency !== toCurrency) {
    const toMajor = Number(args.to_amount)
    if (!Number.isFinite(toMajor) || toMajor <= 0) {
      return {
        error:
          `"${from.name}" is in ${fromCurrency} and "${to.name}" is in ${toCurrency} — ` +
          `ask the user how much arrived in ${toCurrency}, then pass it as to_amount`,
      }
    }
    counterAmount = Math.round(toMajor * 10 ** decimalsOf(toCurrency))
    if (counterAmount <= 0) return { error: 'to_amount out of range' }
    counterFxRate = toMajor / major
  }

  const rawDate = String(args.occurred_at ?? '').trim()
  const date = rawDate || new Date().toISOString().slice(0, 10)
  if (!isDate(date)) return { error: 'occurred_at must be YYYY-MM-DD' }
  if (Date.parse(date) > Date.now() + 86_400_000) return { error: 'date is in the future' }

  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    book_id: bookId,
    account_id: from.id,
    counter_account_id: to.id,
    // A transfer is not spending, so it has no category and no payee.
    category_id: null,
    payee: null,
    type: 'transfer',
    amount: minor,
    currency: fromCurrency,
    counter_amount: counterAmount,
    counter_fx_rate: counterFxRate,
    ...baseSnapshot(minor, fromCurrency, baseCurrency),
    occurred_at: `${date}T12:00:00Z`,
    note: String(args.note ?? '').trim().slice(0, 500) || null,
    source: ctx.source ?? 'web',
  })
  if (error) return { error: error.message }

  ctx.onRecorded()
  return {
    ok: true,
    transferred: {
      from: from.name,
      to: to.name,
      amount: formatMoney(minor, fromCurrency),
      ...(counterAmount != null ? { arrived: formatMoney(counterAmount, toCurrency) } : {}),
      date,
      note: 'Net worth is unchanged — the money only moved.',
    },
  }
}

/** Savings goals + how far along each is. Mirrors src/features/goals/progress.ts:
 *  saved is the sum of contributions, which are tracked separately and never
 *  move real account balances. */
export async function goalProgress(ctx: ToolCtx): Promise<unknown> {
  const { supabase, bookId } = ctx

  const { data: goals, error } = await supabase
    .from('savings_goals')
    .select('id, name, target_amount, currency, target_date')
    .eq('book_id', bookId)
    .eq('is_archived', false)
  if (error) return { error: error.message }
  if (!goals?.length) return { rows: [], note: 'no savings goals set up yet' }

  const { data: contributions } = await supabase
    .from('goal_contributions')
    .select('goal_id, amount')
    .eq('book_id', bookId)

  const savedByGoal = new Map<string, number>()
  for (const c of contributions ?? []) {
    savedByGoal.set(String(c.goal_id), (savedByGoal.get(String(c.goal_id)) ?? 0) + Number(c.amount))
  }

  const today = Date.now()
  return {
    rows: (goals as Row[]).map((g) => {
      const target = Number(g.target_amount)
      const saved = savedByGoal.get(String(g.id)) ?? 0
      const currency = String(g.currency)
      const remaining = Math.max(0, target - saved)
      return {
        name: g.name,
        target: formatMoney(target, currency),
        saved: formatMoney(saved, currency),
        remaining: formatMoney(remaining, currency),
        percent_done: target > 0 ? Math.round(Math.min(100, (saved / target) * 100)) : 0,
        complete: target > 0 && saved >= target,
        target_date: g.target_date ?? null,
        days_left: g.target_date
          ? Math.ceil((Date.parse(String(g.target_date)) - today) / 86_400_000)
          : null,
      }
    }),
  }
}

export async function listRecurring(ctx: ToolCtx): Promise<unknown> {
  const { supabase, bookId } = ctx

  const { data, error } = await supabase
    .from('recurring_transactions')
    .select('name, type, amount, currency, frequency, interval, next_due, auto_post, is_active, account_id, category_id, note')
    .eq('book_id', bookId)
    .order('next_due')
  if (error) return { error: error.message }
  if (!data?.length) return { rows: [], note: 'no repeating bills set up yet' }

  const accounts = await loadAccounts(ctx)
  const accountById = new Map(
    ('error' in accounts ? [] : accounts).map((a) => [String(a.id), String(a.name)]),
  )

  const today = Date.now()
  return {
    rows: (data as Row[]).map((r) => ({
      name: r.name,
      type: r.type,
      amount: formatMoney(Number(r.amount), String(r.currency)),
      repeats: Number(r.interval) > 1 ? `every ${r.interval} ${r.frequency}` : r.frequency,
      next_due: r.next_due,
      days_until: Math.ceil((Date.parse(`${r.next_due}T00:00:00Z`) - today) / 86_400_000),
      account: accountById.get(String(r.account_id)) ?? null,
      recorded_automatically: !!r.auto_post,
      paused: !r.is_active,
    })),
  }
}

/** Schedule a repeating bill. Writes NO transaction now — the recurring-autopost
 *  cron posts each one when it falls due (only if auto_post is on; otherwise the
 *  row is a reminder the app surfaces). */
export async function createRecurring(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> {
  const { supabase, bookId, userId } = ctx

  const name = String(args.name ?? '').trim().slice(0, 80)
  if (!name) return { error: 'name is required' }

  const type = String(args.type ?? '')
  if (type !== 'expense' && type !== 'income') return { error: 'type must be expense or income' }

  const frequency = String(args.frequency ?? '')
  if (!['weekly', 'monthly', 'yearly'].includes(frequency)) {
    return { error: 'frequency must be weekly, monthly or yearly' }
  }

  const interval = Math.trunc(Number(args.interval ?? 1))
  if (!Number.isFinite(interval) || interval < 1 || interval > 52) {
    return { error: 'interval must be a whole number between 1 and 52' }
  }

  const nextDue = String(args.next_due ?? '').trim()
  if (!isDate(nextDue)) return { error: 'next_due must be YYYY-MM-DD' }

  const currency = String(args.currency ?? '').toUpperCase().trim()
  if (!/^[A-Z]{3,8}$/.test(currency)) return { error: 'invalid currency code' }

  const major = Number(args.amount)
  if (!Number.isFinite(major) || major <= 0) return { error: 'amount must be > 0' }
  const minor = Math.round(major * 10 ** decimalsOf(currency))
  if (minor <= 0 || minor > 1e15) return { error: 'amount out of range' }

  const accounts = await loadAccounts(ctx)
  if ('error' in accounts) return accounts
  if (!accounts.length) return { error: 'no accounts exist — ask the user to create one first' }

  const account = matchAccount(accounts, String(args.account_name ?? ''))
  if (!account) {
    return {
      error: 'account not resolved — ask the user which one',
      accounts: accounts.map((a) => ({ name: a.name, currency: a.currency })),
    }
  }
  if (String(account.currency) !== currency) {
    return { error: `account "${account.name}" uses ${account.currency}, not ${currency}` }
  }

  const categoryId = args.category_name != null
    ? await resolveCategoryId(ctx, String(args.category_name), type)
    : null

  const { error } = await supabase.from('recurring_transactions').insert({
    user_id: userId,
    book_id: bookId,
    name,
    type,
    account_id: account.id,
    category_id: categoryId,
    amount: minor,
    currency,
    frequency,
    interval,
    next_due: nextDue,
    is_active: true,
    auto_post: args.auto_post === true,
    note: String(args.note ?? '').trim().slice(0, 500) || null,
  })
  if (error) return { error: error.message }

  ctx.onRecorded()
  return {
    ok: true,
    scheduled: {
      name,
      type,
      amount: formatMoney(minor, currency),
      account: account.name,
      repeats: interval > 1 ? `every ${interval} ${frequency}` : frequency,
      next_due: nextDue,
      recorded_automatically: args.auto_post === true,
      note: args.auto_post === true
        ? 'It will be recorded automatically each time it falls due.'
        : 'Nothing is recorded automatically — this is a reminder.',
    },
  }
}

/** Assets minus debts in the base currency, mirroring AccountsPage. Accounts
 *  flagged exclude_from_stats are listed but not counted; accounts whose currency
 *  has no known rate are reported separately rather than silently counted as
 *  zero, so the model can say the total is incomplete instead of quoting a wrong
 *  number. */
export async function netWorth(ctx: ToolCtx): Promise<unknown> {
  const { supabase, bookId, userId, baseCurrency } = ctx

  const [accountsRes, balancesRes, ratesRes] = await Promise.all([
    supabase.from('accounts')
      .select('id, name, type, currency, is_liability, exclude_from_stats, opening_balance')
      .eq('book_id', bookId).eq('is_archived', false).order('sort_order'),
    supabase.from('account_balances').select('account_id, balance').eq('book_id', bookId),
    // fx_rates is scoped by user, not book — it has no book_id column.
    supabase.from('fx_rates').select('base, quote, rate, as_of').eq('user_id', userId),
  ])
  if (accountsRes.error) return { error: accountsRes.error.message }
  if (balancesRes.error) return { error: balancesRes.error.message }

  const balanceById = new Map<string, number>(
    (balancesRes.data ?? []).map((b: Row) => [String(b.account_id), Number(b.balance)]),
  )
  const table = buildRateTable((ratesRes.data ?? []) as FxRow[], baseCurrency)

  let assets = 0
  let debts = 0
  const rows: Row[] = []
  const noRate: string[] = []

  for (const a of (accountsRes.data ?? []) as Row[]) {
    const currency = String(a.currency)
    const balance = balanceById.get(String(a.id)) ?? Number(a.opening_balance)
    const counted = !a.exclude_from_stats
    const converted = convertMinor(balance, currency, baseCurrency, table)

    rows.push({
      name: a.name,
      type: a.type,
      // Debts are stored negative; show the plain "owed" figure.
      balance: formatMoney(a.is_liability ? Math.abs(balance) : balance, currency),
      is_debt: !!a.is_liability,
      counted_in_net_worth: counted && converted != null,
    })

    if (!counted) continue
    if (converted == null) {
      noRate.push(`${a.name} (${currency})`)
      continue
    }
    if (a.is_liability) debts += Math.abs(converted)
    else assets += converted
  }

  return {
    net_worth: formatMoney(assets - debts, baseCurrency),
    total_assets: formatMoney(assets, baseCurrency),
    total_debts: formatMoney(debts, baseCurrency),
    accounts: rows,
    ...(noRate.length
      ? {
          warning:
            `No exchange rate for ${noRate.join(', ')}, so ${noRate.length === 1 ? 'it is' : 'they are'} ` +
            `left out of the total. Say so when you answer.`,
        }
      : {}),
  }
}

/** Create a category, or hand back the existing one with the same name. The
 *  model is told to prefer existing categories, but "prefer" is a prompt rule —
 *  the case-insensitive dedupe here is what actually stops the list filling up
 *  with near-duplicates. */
export async function createCategory(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> {
  const { supabase, bookId, userId } = ctx

  const kind = String(args.kind ?? '')
  if (kind !== 'expense' && kind !== 'income') return { error: 'kind must be expense or income' }

  const name = String(args.name ?? '').trim().slice(0, 60)
  if (!name) return { error: 'name is required' }

  const { data: existing, error: exErr } = await supabase
    .from('categories')
    .select('id, name, is_archived')
    .eq('book_id', bookId).eq('kind', kind).ilike('name', name)
    .limit(1)
  if (exErr) return { error: exErr.message }
  if (existing?.[0]) {
    return {
      ok: true,
      created: false,
      name: existing[0].name,
      note: existing[0].is_archived
        ? 'A category with this name already exists but is archived; it was reused.'
        : 'A category with this name already exists; use it as-is.',
    }
  }

  // Optional parent, same kind, must already exist. One level only — the app
  // nests categories, but a bot inventing deep trees is not worth the confusion.
  let parentId: string | null = null
  const parentName = String(args.parent_name ?? '').trim()
  if (parentName) {
    const { data: parents } = await supabase
      .from('categories')
      .select('id, parent_id')
      .eq('book_id', bookId).eq('kind', kind).eq('is_archived', false)
      .ilike('name', parentName)
      .limit(1)
    if (!parents?.[0]) return { error: `no ${kind} category named "${parentName}" to nest under` }
    if (parents[0].parent_id) return { error: `"${parentName}" is already a sub-category` }
    parentId = parents[0].id
  }

  const { error: insErr } = await supabase.from('categories').insert({
    user_id: userId, book_id: bookId, name, kind, parent_id: parentId,
  })
  if (insErr) return { error: insErr.message }

  ctx.onRecorded()
  return { ok: true, created: true, name, kind, parent: parentName || null }
}

/** Create an account. Like record_transaction, the model's claim that the user
 *  confirmed is only a prompt rule — so the blast radius is bounded here: one
 *  row, own book, known type, sane currency and amount. */
export async function createAccount(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> {
  const { supabase, bookId, userId } = ctx

  const name = String(args.name ?? '').trim().slice(0, 60)
  if (!name) return { error: 'name is required' }

  const type = String(args.type ?? '')
  if (!(ACCOUNT_TYPES as readonly string[]).includes(type)) {
    return { error: `type must be one of: ${ACCOUNT_TYPES.join(', ')}` }
  }

  const currency = String(args.currency ?? '').toUpperCase().trim()
  if (!/^[A-Z]{3,8}$/.test(currency)) return { error: 'invalid currency code' }

  const { data: clash } = await supabase
    .from('accounts').select('id').eq('book_id', bookId).ilike('name', name).limit(1)
  if (clash?.[0]) return { error: `an account named "${name}" already exists` }

  const isLiability = LIABILITY_TYPES.has(type)

  const openingMajor = Number(args.opening_balance ?? 0)
  if (!Number.isFinite(openingMajor) || openingMajor < 0) {
    return { error: 'opening_balance must be 0 or more (for a debt, how much is owed)' }
  }
  const magnitude = Math.round(openingMajor * 10 ** decimalsOf(currency))
  if (magnitude > 1e15) return { error: 'opening_balance out of range' }
  // Debts carry a negative balance so they subtract from net worth (same rule as
  // AccountForm).
  const openingBalance = isLiability ? -magnitude : magnitude

  // Credit limit only applies to debts; ignored otherwise.
  let creditLimit: number | null = null
  if (isLiability && args.credit_limit != null) {
    const limitMajor = Number(args.credit_limit)
    if (!Number.isFinite(limitMajor) || limitMajor < 0) return { error: 'credit_limit must be 0 or more' }
    creditLimit = Math.round(limitMajor * 10 ** decimalsOf(currency))
  }

  const { error: insErr } = await supabase.from('accounts').insert({
    user_id: userId,
    book_id: bookId,
    name,
    type,
    currency,
    opening_balance: openingBalance,
    is_liability: isLiability,
    credit_limit: creditLimit,
  })
  if (insErr) return { error: insErr.message }

  ctx.onRecorded()
  return {
    ok: true,
    created: {
      name,
      type,
      currency,
      is_debt: isLiability,
      balance: formatMoney(magnitude, currency),
    },
  }
}

/** The one write the model can perform. Every field is validated here — the
 *  model's claim of "user confirmed" is a prompt rule, but the blast radius is
 *  bounded regardless: one row, own book, own account, sane amount. Account and
 *  category lookups are book-scoped so this is safe under the service role too. */
export async function recordTransaction(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> {
  const { supabase, bookId, userId, baseCurrency } = ctx

  const type = String(args.type ?? '')
  if (type !== 'expense' && type !== 'income') return { error: 'type must be expense or income' }

  const amountMajor = Number(args.amount)
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) return { error: 'amount must be > 0' }

  const currency = String(args.currency ?? '').toUpperCase().trim()
  if (!/^[A-Z]{3,8}$/.test(currency)) return { error: 'invalid currency code' }

  const minor = Math.round(amountMajor * 10 ** decimalsOf(currency))
  if (minor <= 0 || minor > 1e15) return { error: 'amount out of range' }

  // Date: default today, reject unparseable or far-future.
  const rawDate = String(args.occurred_at ?? '').trim()
  const date = rawDate || new Date().toISOString().slice(0, 10)
  if (!isDate(date)) return { error: 'occurred_at must be YYYY-MM-DD' }
  if (Date.parse(date) > Date.now() + 86_400_000) return { error: 'date is in the future' }

  // Resolve the account inside this book (RLS also guards on web; on the webhook
  // the book_id filter inside loadAccounts IS the guard).
  const accounts = await loadAccounts(ctx)
  if ('error' in accounts) return accounts
  if (!accounts.length) return { error: 'no accounts exist — ask the user to create one first' }

  const account = matchAccount(accounts, String(args.account_name ?? ''))
  if (!account) {
    return {
      error: 'account not resolved — ask the user which one',
      accounts: accounts.map((a) => ({ name: a.name, currency: a.currency })),
    }
  }
  if (String(account.currency) !== currency) {
    return {
      error:
        `account "${account.name}" uses ${account.currency}, not ${currency} — ` +
        'ask the user for the amount in the account currency or another account',
    }
  }

  // Optional category by name, matching the transaction kind.
  const categoryId = await resolveCategoryId(ctx, String(args.category_name ?? ''), type)

  const payee = String(args.payee ?? '').trim().slice(0, 120) || null
  const note = String(args.note ?? '').trim().slice(0, 500) || null

  const { error: insErr } = await supabase.from('transactions').insert({
    user_id: userId,
    book_id: bookId,
    account_id: account.id,
    category_id: categoryId,
    type,
    amount: minor,
    currency,
    ...baseSnapshot(minor, currency, baseCurrency),
    occurred_at: `${date}T12:00:00Z`,
    note,
    payee,
    source: ctx.source ?? 'web',
  })
  if (insErr) return { error: insErr.message }

  ctx.onRecorded()
  return {
    ok: true,
    recorded: {
      type,
      amount: formatMoney(minor, currency),
      account: account.name,
      date,
      category_matched: categoryId != null,
    },
  }
}

// --- document extraction (Gemini vision, strict JSON, no tools) -------------

export type DocumentType = 'receipt' | 'transaction_history' | 'unknown'
export type TransactionDirection = 'debit' | 'credit'

export interface ScannedTransaction {
  date: string | null
  description: string | null
  direction: TransactionDirection | null
  amount: number | null
  currency: string | null
  reference: string | null
  note: string | null
  confidence: number | null
}

export interface ScanDocument {
  document_type: DocumentType
  confidence: number | null
  currency: string | null
  account_name: string | null
  transactions: ScannedTransaction[]
  warnings: string[]
}

/** One vision call: one or more photos in, structured rows out. The scanner
 * deliberately does not write to the database; the caller presents its result
 * for one explicit confirmation first. Throws 'vision-not-configured' when
 * GEMINI_API_KEY is unset. */
export async function extractDocument(imageDataUrls: string[], caption: string): Promise<ScanDocument> {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('vision-not-configured')

  const vision = new OpenAI({
    apiKey: key,
    baseURL:
      Deno.env.get('GEMINI_BASE_URL') ?? 'https://generativelanguage.googleapis.com/v1beta/openai/',
  })

  const res = await vision.chat.completions.create({
    model: Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-flash-lite',
    temperature: 0,
    max_tokens: 2400,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Classify and extract financial-document images. Reply with ONLY one JSON object, no prose, ' +
          'matching exactly: {"document_type":"receipt"|"transaction_history"|"unknown", ' +
          '"confidence":number|null, "currency":"ISO code e.g. IDR"|null, ' +
          '"account_name":string|null, "transactions":[{"date":"YYYY-MM-DD"|null, ' +
          '"description":string|null, "direction":"debit"|"credit"|null, ' +
          '"amount":number|null, "currency":"ISO code"|null, "reference":string|null, ' +
          '"note":string|null, "confidence":number|null}], "warnings":[string]}. ' +
          'A receipt/invoice has one purchase and a grand total: return document_type="receipt" and ' +
          'exactly one transaction whose amount is the grand total. A receipt is money spent, so set its ' +
          'direction="debit" unless it is clearly a refund (then "credit"). A bank/e-wallet transaction ' +
          'history has repeated dated rows: return ' +
          'document_type="transaction_history" and one transaction per visible row. ' +
          'For bank/e-wallet histories, debit/outgoing/spent/paid is direction="debit" and ' +
          'credit/incoming/received is direction="credit". Ignore balances, running totals, headers, ' +
          'pending rows and rows where the amount or direction cannot be read. Amounts are positive MAJOR ' +
          'units without thousands separators. Preserve a provider transaction/reference ID when visible. ' +
          'Indonesian amounts like 25.000 mean twenty-five thousand; use IDR unless another currency is ' +
          'shown. Images may be sequential tiles of one long screenshot: combine their rows and do not ' +
          'repeat overlap rows. Never invent missing values. If it is neither, return document_type="unknown" ' +
          'with an empty transactions array and a short warning.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: caption || 'Classify this financial document and extract its transactions.' },
          ...imageDataUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ],
        // deno-lint-ignore no-explicit-any
      } as any,
    ],
  })

  const raw = res.choices[0]?.message?.content ?? ''
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const parsed = JSON.parse(cleaned) as Partial<ScanDocument>
  const documentType: DocumentType =
    parsed.document_type === 'receipt' || parsed.document_type === 'transaction_history'
      ? parsed.document_type
      : 'unknown'
  const currency = typeof parsed.currency === 'string' ? parsed.currency.toUpperCase().slice(0, 8) : null

  return {
    document_type: documentType,
    confidence:
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : null,
    currency,
    account_name: typeof parsed.account_name === 'string' ? parsed.account_name.slice(0, 120) : null,
    transactions: Array.isArray(parsed.transactions)
      ? parsed.transactions.slice(0, 100).flatMap((row) => {
          if (!row || typeof row !== 'object') return []
          const item = row as Partial<ScannedTransaction>
          const direction: TransactionDirection | null =
            item.direction === 'debit' || item.direction === 'credit' ? item.direction : null
          return [{
            date: typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : null,
            description: typeof item.description === 'string' ? item.description.slice(0, 160) : null,
            direction,
            amount: typeof item.amount === 'number' && Number.isFinite(item.amount) && item.amount > 0 ? item.amount : null,
            currency: typeof item.currency === 'string' ? item.currency.toUpperCase().slice(0, 8) : currency,
            reference: typeof item.reference === 'string' ? item.reference.slice(0, 160) : null,
            note: typeof item.note === 'string' ? item.note.slice(0, 300) : null,
            confidence:
              typeof item.confidence === 'number' && Number.isFinite(item.confidence)
                ? Math.max(0, Math.min(1, item.confidence))
                : null,
          }]
        })
      : [],
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings
          .filter((item): item is string => typeof item === 'string')
          .slice(0, 8)
          .map((item) => item.slice(0, 240))
      : [],
  }
}

// --- shared limits (client tiles stay under the per-image cap) --------------
export const MAX_STEPS = 6
export const MAX_IMAGES = 6
export const MAX_IMAGE_CHARS = 1_300_000
export const MAX_TOTAL_IMAGE_CHARS = 7_200_000

/** Build the agent system prompt. Every channel shares the same rules; only the
 *  formatting guidance differs. The chat channels also have a server-persisted
 *  history, so the "confirm before write" rule has to span messages there. */
export function buildSystemPrompt(opts: {
  today: string
  baseCurrency: string
  language: string
  channel?: 'web' | 'whatsapp' | 'telegram'
}): string {
  const { today, baseCurrency, language, channel = 'web' } = opts
  const common =
    `You are the built-in money assistant for a personal finance app called Tracr. ` +
    `Today is ${today}. The user's base currency is ${baseCurrency}. You are looking ` +
    `at a single ledger (one "book").\n` +
    `Rules:\n` +
    `- Answer ONLY from the tools. Never invent or estimate numbers. If a tool ` +
    `returns no rows, say there is no data for that period.\n` +
    `- Amounts from tools are already formatted with the correct currency; quote ` +
    `them exactly as given.\n` +
    `- Be concise and concrete. Prefer short bullet points. Use plain, everyday ` +
    `words — no finance jargon.\n` +
    `- Reply in ${language}.\n` +
    `- Recording: you can save ONE expense/income with record_transaction, but ` +
    `ONLY after the user explicitly says yes to a specific amount in this ` +
    `conversation. Before asking for confirmation, check list_accounts; if there ` +
    `is more than one account, ask which one. After recording, restate exactly ` +
    `what was saved. Never record the same receipt twice.\n` +
    `- Categories: every transaction you record should have one. Check ` +
    `list_categories and pick the closest existing category yourself — do not make ` +
    `the user choose, and do not ask permission to use an existing one. Only when ` +
    `nothing fits, create_category, then use it and mention that you made it. A ` +
    `new category must earn its place: "Coffee" for someone buying coffee weekly, ` +
    `yes; a separate category for one unusual purchase, no — put it in the closest ` +
    `broader one instead.\n` +
    `- Accounts: create_account ONLY when the user has asked for a new account and ` +
    `confirmed its name, type and currency. If you cannot work out which account a ` +
    `transaction belongs to, ask — never invent a new account to hold it.\n` +
    `- Net worth: net_worth already subtracts debts and converts to the base ` +
    `currency. Quote its numbers as given; never add up the per-account balances ` +
    `yourself. If it returns a warning that accounts were left out, pass that on.\n` +
    `- Changing or deleting: find the transaction with search_transactions first, ` +
    `then show the user exactly which one you mean (amount, date, account) and wait ` +
    `for a clear yes. Deleting cannot be undone, so if more than one row could be ` +
    `the one they mean, list them and ask — never guess, and never touch more than ` +
    `the single transaction they asked about. Only ever use an id that came back ` +
    `from search_transactions in this conversation.\n` +
    `- Transfers: money moved between the user's OWN accounts is record_transfer, ` +
    `not an expense — it does not change net worth. "I moved 500k from BCA to cash", ` +
    `"topped up GoPay" are transfers. Paying a shop is not.\n` +
    `- Repeating bills: create_recurring only SCHEDULES future transactions, it ` +
    `records nothing today. If the user also wants today's payment in the ledger, ` +
    `that is a separate record_transaction. Confirm the amount, how often, and the ` +
    `next due date before creating.\n` +
    `- When you receive a [RECEIPT_SCAN] or [DOCUMENT_SCAN] block: it is ` +
    `machine-extracted data from a photo the user sent. Summarize it briefly ` +
    `(merchant, date, total, notable items), point out anything the scanner ` +
    `flagged, then ask whether to record it. If the document could not be read or ` +
    `the total is missing, say so and ask the user to type the amount instead.\n` +
    `- If asked anything unrelated to this user's money, politely decline.`

  const remembers =
    `Earlier messages in this chat are remembered, so a plain "yes" refers to the ` +
    `transaction you just proposed.`

  if (channel === 'whatsapp') {
    return (
      common +
      `\n- This is a WhatsApp chat. Keep replies short (a couple of lines). Do NOT ` +
      `use markdown; WhatsApp uses *single asterisks* for bold. ${remembers}`
    )
  }
  if (channel === 'telegram') {
    // The transport converts this subset to Telegram HTML (see tg-webhook), so
    // asking for plain text is both unnecessary and a fight the model loses —
    // it emits markdown regardless of instructions.
    return (
      common +
      `\n- This is a Telegram chat. Keep replies short — a couple of lines, and no ` +
      `preamble. You may use **bold** for the numbers that matter and "- " for a ` +
      `short list. Never use headings, tables, or code blocks: they do not render ` +
      `in a chat. Prefer one line per fact over a list of one. ${remembers}`
    )
  }
  return common
}

export interface AgentResult {
  text: string
  recorded: boolean
  timedOut?: boolean
}

/** Run the tool-calling loop to a final text answer. Mutates `messages` in place
 *  (appends assistant + tool turns). Sets ctx.onRecorded internally so callers
 *  learn whether a write happened. Throws on transport/LLM errors — the caller
 *  wraps it. Returns { timedOut: true } if it never converges within maxSteps. */
export async function runAgentLoop(opts: {
  client: OpenAI
  model: string
  // deno-lint-ignore no-explicit-any
  messages: any[]
  ctx: ToolCtx
  disableThinking: boolean
  maxSteps?: number
}): Promise<AgentResult> {
  const { client, model, messages, ctx, disableThinking, maxSteps = MAX_STEPS } = opts
  let recorded = false
  ctx.onRecorded = () => {
    recorded = true
  }

  for (let step = 0; step < maxSteps; step++) {
    const res = await client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.4,
      max_tokens: 800,
      // DeepSeek V4 non-thinking mode; harmlessly omitted for other providers.
      ...(disableThinking ? { thinking: { type: 'disabled' } } : {}),
      // deno-lint-ignore no-explicit-any
    } as any)

    const msg = res.choices[0]?.message
    const calls = msg?.tool_calls ?? []

    if (calls.length === 0) {
      return { text: msg?.content ?? '', recorded }
    }

    // Echo the assistant's tool-call turn, then answer each call.
    messages.push(msg)
    for (const call of calls) {
      // deno-lint-ignore no-explicit-any
      const fn = (call as any).function
      let args: Record<string, unknown> = {}
      try {
        args = fn?.arguments ? JSON.parse(fn.arguments) : {}
      } catch {
        args = {}
      }
      const result = await runTool(ctx, fn?.name ?? '', args)
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
  // Ran out of tool-call rounds without a final answer.
  return { text: '', recorded, timedOut: true }
}
